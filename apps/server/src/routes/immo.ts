import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import {
  IMMO_RENTAL_STATUS_KEYS,
  IMMO_SALE_STATUS_KEYS,
  type ModuleKey,
} from '@rp-compta/shared';
import { db } from '../db';
import { immoRentals, immoRentInvoices, immoSales, immoParcels, companyClients, companies, immoPriceTypes, immoOptions, immoDiscounts } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';
import {
  DEFAULT_LOCATION_TYPES, DEFAULT_VENTE_TYPES,
  DEFAULT_LOCATION_OPTIONS, DEFAULT_VENTE_OPTIONS, DEFAULT_DISCOUNTS,
} from '../data/immoDefaults';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const pd = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));
const parsePd = (v: string | null): unknown => {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
};
const money = z.coerce.number().nonnegative().finite().max(999_999_999.99);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

async function gate(req: Request, companyId: number, moduleKey: ModuleKey) {
  const acc = await getModuleAccess(req.user!.id, companyId, moduleKey);
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

// Ensemble des n° de propriété qui ont une parcelle sur la carte (pour le lien fiche → carte).
async function parcelRefSet(companyId: number, refs: string[]): Promise<Set<string>> {
  const uniq = [...new Set(refs)];
  if (!uniq.length) return new Set();
  const rows = await db
    .select({ propertyRef: immoParcels.propertyRef })
    .from(immoParcels)
    .where(and(eq(immoParcels.companyId, companyId), inArray(immoParcels.propertyRef, uniq)));
  return new Set(rows.map((r) => r.propertyRef));
}

async function clientInCompany(clientId: number, companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: companyClients.id })
    .from(companyClients)
    .where(and(eq(companyClients.id, clientId), eq(companyClients.companyId, companyId)))
    .limit(1);
  return !!rows[0];
}

// ---------------- LOCATIONS ----------------

export const meImmoRentalsRouter = Router({ mergeParams: true });
meImmoRentalsRouter.use(requireAuth);

const rentalSchema = z.object({
  propertyRef: z.string().trim().min(1).max(120),
  clientId: z.number().int().positive().nullish(),
  tenantName: z.string().trim().max(150).nullish(),
  agent: z.string().trim().max(120).nullish(),
  weeklyRent: money,
  startDate: dateStr.nullish(),
  status: z.enum(IMMO_RENTAL_STATUS_KEYS as [string, ...string[]]).optional(),
  autoGenerate: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  tenantDiscordId: z.string().trim().regex(/^\d{5,25}$/).nullish().or(z.literal('')),
  notes: z.string().max(2000).nullish(),
  pricingDetail: z.unknown().nullish(),
});

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  tenant: z.string().trim().max(120).optional(),
  status: z.string().trim().max(20).optional(),
  agent: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

meImmoRentalsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const qp = listQuery.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: 'bad_request' });
    const { q, tenant, status, agent, page, limit } = qp.data;

    const filters = [
      eq(immoRentals.companyId, companyId),
      q ? like(immoRentals.propertyRef, `%${q}%`) : undefined,
      tenant ? or(like(immoRentals.tenantName, `%${tenant}%`), like(companyClients.name, `%${tenant}%`)) : undefined,
      status && IMMO_RENTAL_STATUS_KEYS.includes(status as never) ? eq(immoRentals.status, status as 'active') : undefined,
      agent ? like(immoRentals.agent, `%${agent}%`) : undefined,
    ].filter(Boolean);
    const where = and(...(filters as []));

    const [countRows, rentals, statRows, unpaid, totalUnpaid] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(immoRentals).leftJoin(companyClients, eq(immoRentals.clientId, companyClients.id)).where(where),
      db
        .select({
          id: immoRentals.id,
          propertyRef: immoRentals.propertyRef,
          clientId: immoRentals.clientId,
          clientName: companyClients.name,
          tenantName: immoRentals.tenantName,
          agent: immoRentals.agent,
          weeklyRent: immoRentals.weeklyRent,
          startDate: immoRentals.startDate,
          status: immoRentals.status,
          autoGenerate: immoRentals.autoGenerate,
          reminderEnabled: immoRentals.reminderEnabled,
          tenantDiscordId: immoRentals.tenantDiscordId,
          notes: immoRentals.notes,
          pricingDetail: immoRentals.pricingDetail,
          createdAt: immoRentals.createdAt,
        })
        .from(immoRentals)
        .leftJoin(companyClients, eq(immoRentals.clientId, companyClients.id))
        .where(where)
        .orderBy(desc(immoRentals.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({
          total: sql<number>`COUNT(*)`,
          active: sql<number>`COALESCE(SUM(CASE WHEN ${immoRentals.status} = 'active' THEN 1 ELSE 0 END), 0)`,
        })
        .from(immoRentals)
        .where(eq(immoRentals.companyId, companyId)),
      db
        .select({ rentalId: immoRentInvoices.rentalId, n: sql<number>`COUNT(*)` })
        .from(immoRentInvoices)
        .where(and(eq(immoRentInvoices.companyId, companyId), eq(immoRentInvoices.status, 'impaye')))
        .groupBy(immoRentInvoices.rentalId),
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(immoRentInvoices)
        .where(and(eq(immoRentInvoices.companyId, companyId), eq(immoRentInvoices.status, 'impaye'))),
    ]);
    const unpaidById = new Map(unpaid.map((u) => [u.rentalId, Number(u.n)]));
    const onMap = await parcelRefSet(companyId, rentals.map((r) => r.propertyRef));

    res.json({
      canWrite: g.canWrite,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      stats: {
        total: Number(statRows[0]?.total ?? 0),
        active: Number(statRows[0]?.active ?? 0),
        unpaidInvoices: Number(totalUnpaid[0]?.n ?? 0),
      },
      rentals: rentals.map((r) => ({
        id: r.id,
        propertyRef: r.propertyRef,
        clientId: r.clientId,
        tenant: r.clientName ?? r.tenantName ?? null,
        agent: r.agent,
        weeklyRent: Number(r.weeklyRent),
        startDate: r.startDate,
        status: r.status,
        autoGenerate: !!r.autoGenerate,
        reminderEnabled: !!r.reminderEnabled,
        tenantDiscordId: r.tenantDiscordId,
        notes: r.notes,
        pricingDetail: parsePd(r.pricingDetail),
        createdAt: r.createdAt,
        unpaidCount: unpaidById.get(r.id) ?? 0,
        onMap: onMap.has(r.propertyRef),
      })),
    });
  }),
);

// Toutes les factures de loyer impayées de l'entreprise (vue globale).
meImmoRentalsRouter.get(
  '/unpaid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: immoRentInvoices.id,
        rentalId: immoRentInvoices.rentalId,
        weekStart: immoRentInvoices.weekStart,
        amount: immoRentInvoices.amount,
        propertyRef: immoRentals.propertyRef,
        tenantName: immoRentals.tenantName,
        clientName: companyClients.name,
      })
      .from(immoRentInvoices)
      .innerJoin(immoRentals, eq(immoRentInvoices.rentalId, immoRentals.id))
      .leftJoin(companyClients, eq(immoRentals.clientId, companyClients.id))
      .where(and(eq(immoRentInvoices.companyId, companyId), eq(immoRentInvoices.status, 'impaye')))
      .orderBy(desc(immoRentInvoices.weekStart))
      .limit(500);
    res.json({
      canWrite: g.canWrite,
      invoices: rows.map((r) => ({
        id: r.id,
        rentalId: r.rentalId,
        weekStart: r.weekStart,
        amount: Number(r.amount),
        propertyRef: r.propertyRef,
        tenant: r.clientName ?? r.tenantName ?? null,
      })),
    });
  }),
);

meImmoRentalsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = rentalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.clientId && !(await clientInCompany(parsed.data.clientId, companyId))) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const inserted = await db.insert(immoRentals).values({
      companyId,
      propertyRef: parsed.data.propertyRef,
      clientId: parsed.data.clientId ?? null,
      tenantName: parsed.data.tenantName || null,
      agent: parsed.data.agent || null,
      weeklyRent: String(round2(parsed.data.weeklyRent)),
      startDate: parsed.data.startDate ?? null,
      status: (parsed.data.status ?? 'active') as 'active',
      autoGenerate: parsed.data.autoGenerate ?? false,
      reminderEnabled: parsed.data.reminderEnabled ?? false,
      tenantDiscordId: parsed.data.tenantDiscordId || null,
      notes: parsed.data.notes || null,
      pricingDetail: pd(parsed.data.pricingDetail),
      createdByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-rentals', companyId]]);
    res.status(201).json({ ok: true, id: Number(inserted[0].insertId) });
  }),
);

meImmoRentalsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = rentalSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.clientId && !(await clientInCompany(parsed.data.clientId, companyId))) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const patch: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.propertyRef !== undefined) patch.propertyRef = d.propertyRef;
    if (d.clientId !== undefined) patch.clientId = d.clientId ?? null;
    if (d.tenantName !== undefined) patch.tenantName = d.tenantName || null;
    if (d.agent !== undefined) patch.agent = d.agent || null;
    if (d.weeklyRent !== undefined) patch.weeklyRent = String(round2(d.weeklyRent));
    if (d.startDate !== undefined) patch.startDate = d.startDate ?? null;
    if (d.status !== undefined) patch.status = d.status;
    if (d.autoGenerate !== undefined) patch.autoGenerate = d.autoGenerate;
    if (d.reminderEnabled !== undefined) patch.reminderEnabled = d.reminderEnabled;
    if (d.tenantDiscordId !== undefined) patch.tenantDiscordId = d.tenantDiscordId || null;
    if (d.notes !== undefined) patch.notes = d.notes || null;
    if (d.pricingDetail !== undefined) patch.pricingDetail = pd(d.pricingDetail);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(immoRentals)
      .set(patch)
      .where(and(eq(immoRentals.id, id), eq(immoRentals.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-rentals', companyId]]);
    res.json({ ok: true });
  }),
);

meImmoRentalsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(immoRentals)
      .where(and(eq(immoRentals.id, id), eq(immoRentals.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-rentals', companyId]]);
    res.json({ ok: true });
  }),
);

// --- loyers (échéances) d'une location ---

meImmoRentalsRouter.get(
  '/:id/invoices',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(immoRentInvoices)
      .where(and(eq(immoRentInvoices.rentalId, id), eq(immoRentInvoices.companyId, companyId)))
      .orderBy(desc(immoRentInvoices.weekStart));
    const invoices = rows.map((i) => ({
      id: i.id,
      weekStart: i.weekStart,
      amount: Number(i.amount),
      status: i.status,
      paidAt: i.paidAt,
    }));
    const paid = invoices.filter((i) => i.status === 'paye');
    const unpaid = invoices.filter((i) => i.status === 'impaye');
    const lastPaid = paid
      .filter((i) => i.paidAt)
      .sort((a, b) => new Date(b.paidAt as unknown as string).getTime() - new Date(a.paidAt as unknown as string).getTime())[0];
    res.json({
      canWrite: g.canWrite,
      summary: {
        paidCount: paid.length,
        unpaidCount: unpaid.length,
        totalPaid: round2(paid.reduce((s, i) => s + i.amount, 0)),
        totalUnpaid: round2(unpaid.reduce((s, i) => s + i.amount, 0)),
        lastPayment: lastPaid ? { weekStart: lastPaid.weekStart, amount: lastPaid.amount, paidAt: lastPaid.paidAt } : null,
      },
      invoices,
    });
  }),
);

const genSchema = z.object({ weekStart: dateStr });

meImmoRentalsRouter.post(
  '/:id/invoices',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const parsed = genSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const rental = await db
      .select({ rent: immoRentals.weeklyRent })
      .from(immoRentals)
      .where(and(eq(immoRentals.id, id), eq(immoRentals.companyId, companyId)))
      .limit(1);
    if (!rental[0]) return res.status(404).json({ error: 'not_found' });
    try {
      await db.insert(immoRentInvoices).values({
        companyId,
        rentalId: id,
        weekStart: parsed.data.weekStart,
        amount: rental[0].rent,
        status: 'impaye',
      });
    } catch {
      return res.status(409).json({ error: 'week_exists' });
    }
    emitInvalidate(['irs', `company:${companyId}`], [['immo-rentals', companyId], ['immo-invoices', id]]);
    res.status(201).json({ ok: true });
  }),
);

const invStatusSchema = z.object({ status: z.enum(['paye', 'impaye']) });

meImmoRentalsRouter.patch(
  '/invoices/:invoiceId',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const invoiceId = parseId(req.params.invoiceId);
    if (!companyId || !invoiceId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const parsed = invStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(immoRentInvoices)
      .set({
        status: parsed.data.status,
        paidAt: parsed.data.status === 'paye' ? sql`CURRENT_TIMESTAMP` : null,
      })
      .where(and(eq(immoRentInvoices.id, invoiceId), eq(immoRentInvoices.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    const rentalRow = await db
      .select({ rentalId: immoRentInvoices.rentalId })
      .from(immoRentInvoices)
      .where(eq(immoRentInvoices.id, invoiceId))
      .limit(1);
    emitInvalidate(
      ['irs', `company:${companyId}`],
      [['immo-rentals', companyId], ['immo-invoices', rentalRow[0]?.rentalId ?? 0]],
    );
    res.json({ ok: true });
  }),
);

// ---------------- VENTES ----------------

export const meImmoSalesRouter = Router({ mergeParams: true });
meImmoSalesRouter.use(requireAuth);

const saleSchema = z.object({
  propertyRef: z.string().trim().min(1).max(120),
  clientId: z.number().int().positive().nullish(),
  buyerName: z.string().trim().max(150).nullish(),
  agent: z.string().trim().max(120).nullish(),
  price: money,
  saleDate: dateStr.nullish(),
  status: z.enum(IMMO_SALE_STATUS_KEYS as [string, ...string[]]).optional(),
  notes: z.string().max(2000).nullish(),
  pricingDetail: z.unknown().nullish(),
});

meImmoSalesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const qp = listQuery.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: 'bad_request' });
    const { q, tenant, status, agent, page, limit } = qp.data;

    const filters = [
      eq(immoSales.companyId, companyId),
      q ? like(immoSales.propertyRef, `%${q}%`) : undefined,
      tenant ? or(like(immoSales.buyerName, `%${tenant}%`), like(companyClients.name, `%${tenant}%`)) : undefined,
      status && IMMO_SALE_STATUS_KEYS.includes(status as never) ? eq(immoSales.status, status as 'disponible') : undefined,
      agent ? like(immoSales.agent, `%${agent}%`) : undefined,
    ].filter(Boolean);
    const where = and(...(filters as []));

    const [countRows, rows, statRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(immoSales).leftJoin(companyClients, eq(immoSales.clientId, companyClients.id)).where(where),
      db
        .select({
          id: immoSales.id,
          propertyRef: immoSales.propertyRef,
          clientId: immoSales.clientId,
          clientName: companyClients.name,
          buyerName: immoSales.buyerName,
          agent: immoSales.agent,
          price: immoSales.price,
          status: immoSales.status,
          saleDate: immoSales.saleDate,
          notes: immoSales.notes,
          pricingDetail: immoSales.pricingDetail,
          createdAt: immoSales.createdAt,
        })
        .from(immoSales)
        .leftJoin(companyClients, eq(immoSales.clientId, companyClients.id))
        .where(where)
        .orderBy(desc(immoSales.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({
          total: sql<number>`COUNT(*)`,
          sold: sql<number>`COALESCE(SUM(CASE WHEN ${immoSales.status} = 'vendu' THEN 1 ELSE 0 END), 0)`,
          revenue: sql<number>`COALESCE(SUM(CASE WHEN ${immoSales.status} = 'vendu' THEN ${immoSales.price} ELSE 0 END), 0)`,
        })
        .from(immoSales)
        .where(eq(immoSales.companyId, companyId)),
    ]);
    const onMap = await parcelRefSet(companyId, rows.map((r) => r.propertyRef));
    res.json({
      canWrite: g.canWrite,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      stats: {
        total: Number(statRows[0]?.total ?? 0),
        sold: Number(statRows[0]?.sold ?? 0),
        revenue: round2(Number(statRows[0]?.revenue ?? 0)),
      },
      sales: rows.map((r) => ({
        id: r.id,
        propertyRef: r.propertyRef,
        clientId: r.clientId,
        buyer: r.clientName ?? r.buyerName ?? null,
        agent: r.agent,
        price: Number(r.price),
        status: r.status,
        saleDate: r.saleDate,
        notes: r.notes,
        pricingDetail: parsePd(r.pricingDetail),
        createdAt: r.createdAt,
        onMap: onMap.has(r.propertyRef),
      })),
    });
  }),
);

meImmoSalesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = saleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.clientId && !(await clientInCompany(parsed.data.clientId, companyId))) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const inserted = await db.insert(immoSales).values({
      companyId,
      propertyRef: parsed.data.propertyRef,
      clientId: parsed.data.clientId ?? null,
      buyerName: parsed.data.buyerName || null,
      agent: parsed.data.agent || null,
      price: String(round2(parsed.data.price)),
      status: (parsed.data.status ?? 'disponible') as 'disponible',
      saleDate: parsed.data.saleDate ?? null,
      notes: parsed.data.notes || null,
      pricingDetail: pd(parsed.data.pricingDetail),
      createdByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-sales', companyId]]);
    res.status(201).json({ ok: true, id: Number(inserted[0].insertId) });
  }),
);

meImmoSalesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = saleSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.clientId && !(await clientInCompany(parsed.data.clientId, companyId))) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    const patch: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.propertyRef !== undefined) patch.propertyRef = d.propertyRef;
    if (d.clientId !== undefined) patch.clientId = d.clientId ?? null;
    if (d.buyerName !== undefined) patch.buyerName = d.buyerName || null;
    if (d.agent !== undefined) patch.agent = d.agent || null;
    if (d.price !== undefined) patch.price = String(round2(d.price));
    if (d.saleDate !== undefined) patch.saleDate = d.saleDate ?? null;
    if (d.status !== undefined) patch.status = d.status;
    if (d.notes !== undefined) patch.notes = d.notes || null;
    if (d.pricingDetail !== undefined) patch.pricingDetail = pd(d.pricingDetail);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(immoSales)
      .set(patch)
      .where(and(eq(immoSales.id, id), eq(immoSales.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-sales', companyId]]);
    res.json({ ok: true });
  }),
);

meImmoSalesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(immoSales)
      .where(and(eq(immoSales.id, id), eq(immoSales.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-sales', companyId]]);
    res.json({ ok: true });
  }),
);

// ---------------- CARTE (parcelles) ----------------

export const meImmoParcelsRouter = Router({ mergeParams: true });
meImmoParcelsRouter.use(requireAuth);

const parcelStatus = z.enum(['disponible', 'vendu', 'active']);
const geometrySchema = z.object({
  type: z.enum(['polygon', 'rectangle', 'marker']),
  coords: z.array(z.array(z.number().finite())).min(1).max(500),
});
const parcelSchema = z.object({
  propertyRef: z.string().trim().min(1).max(120),
  status: parcelStatus.optional(),
  price: money.optional(),
  ownerName: z.string().trim().max(150).nullish(),
  notes: z.string().max(2000).nullish(),
  geometry: geometrySchema,
});

meImmoParcelsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immo_carte');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(immoParcels)
      .where(eq(immoParcels.companyId, companyId))
      .orderBy(desc(immoParcels.id));

    // Lien vers la fiche : on rattache la parcelle à la location ou la vente de même n°.
    const refs = [...new Set(rows.map((r) => r.propertyRef))];
    const [rentalMatches, saleMatches] = refs.length
      ? await Promise.all([
          db
            .select({ id: immoRentals.id, propertyRef: immoRentals.propertyRef })
            .from(immoRentals)
            .where(and(eq(immoRentals.companyId, companyId), inArray(immoRentals.propertyRef, refs))),
          db
            .select({ id: immoSales.id, propertyRef: immoSales.propertyRef })
            .from(immoSales)
            .where(and(eq(immoSales.companyId, companyId), inArray(immoSales.propertyRef, refs))),
        ])
      : [[], []];
    const rentalByRef = new Map(rentalMatches.map((r) => [r.propertyRef, r.id]));
    const saleByRef = new Map(saleMatches.map((s) => [s.propertyRef, s.id]));

    res.json({
      canWrite: g.canWrite,
      parcels: rows.map((p) => {
        const rentalId = rentalByRef.get(p.propertyRef);
        const saleId = saleByRef.get(p.propertyRef);
        const link = rentalId
          ? { kind: 'location' as const, id: rentalId }
          : saleId
            ? { kind: 'vente' as const, id: saleId }
            : null;
        return {
          id: p.id,
          propertyRef: p.propertyRef,
          status: p.status,
          price: Number(p.price),
          ownerName: p.ownerName,
          notes: p.notes,
          geometry: typeof p.geometry === 'string' ? JSON.parse(p.geometry) : p.geometry,
          link,
        };
      }),
    });
  }),
);

meImmoParcelsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immo_carte');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = parcelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const inserted = await db.insert(immoParcels).values({
      companyId,
      propertyRef: parsed.data.propertyRef,
      status: (parsed.data.status ?? 'disponible') as 'disponible',
      price: String(round2(parsed.data.price ?? 0)),
      ownerName: parsed.data.ownerName || null,
      notes: parsed.data.notes || null,
      geometry: parsed.data.geometry,
      createdByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-parcels', companyId]]);
    res.status(201).json({ ok: true, id: Number(inserted[0].insertId) });
  }),
);

meImmoParcelsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immo_carte');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = parcelSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const patch: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.propertyRef !== undefined) patch.propertyRef = d.propertyRef;
    if (d.status !== undefined) patch.status = d.status;
    if (d.price !== undefined) patch.price = String(round2(d.price));
    if (d.ownerName !== undefined) patch.ownerName = d.ownerName || null;
    if (d.notes !== undefined) patch.notes = d.notes || null;
    if (d.geometry !== undefined) patch.geometry = d.geometry;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(immoParcels)
      .set(patch)
      .where(and(eq(immoParcels.id, id), eq(immoParcels.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-parcels', companyId]]);
    res.json({ ok: true });
  }),
);

meImmoParcelsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immo_carte');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(immoParcels)
      .where(and(eq(immoParcels.id, id), eq(immoParcels.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['immo-parcels', companyId]]);
    res.json({ ok: true });
  }),
);

export const meImmoSettingsRouter = Router({ mergeParams: true });
meImmoSettingsRouter.use(requireAuth);

async function seedDefaultsIfEmpty(companyId: number) {
  const co = await db.select({ seeded: companies.immoSeeded }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (co[0]?.seeded) return;

  const [pt, opt, disc] = await Promise.all([
    db.select({ id: immoPriceTypes.id }).from(immoPriceTypes).where(eq(immoPriceTypes.companyId, companyId)).limit(1),
    db.select({ id: immoOptions.id }).from(immoOptions).where(eq(immoOptions.companyId, companyId)).limit(1),
    db.select({ id: immoDiscounts.id }).from(immoDiscounts).where(eq(immoDiscounts.companyId, companyId)).limit(1),
  ]);
  if (pt[0] || opt[0] || disc[0]) {
    await db.update(companies).set({ immoSeeded: true }).where(eq(companies.id, companyId));
    return;
  }

  const ptRows = [
    ...DEFAULT_LOCATION_TYPES.map((t, i) => ({ companyId, kind: 'location' as const, key: t.key, label: t.label, basePrice: String(t.basePrice), sortOrder: i })),
    ...DEFAULT_VENTE_TYPES.map((t, i) => ({ companyId, kind: 'vente' as const, key: t.key, label: t.label, basePrice: String(t.basePrice), sortOrder: i })),
  ];
  const optRows = [
    ...DEFAULT_LOCATION_OPTIONS.map((o, i) => ({ companyId, kind: 'location' as const, name: o.name, pct: String(o.pct), sortOrder: i })),
    ...DEFAULT_VENTE_OPTIONS.map((o, i) => ({ companyId, kind: 'vente' as const, name: o.name, pct: String(o.pct), sortOrder: i })),
  ];
  const discRows = DEFAULT_DISCOUNTS.map((d, i) => ({ companyId, name: d.name, pct: String(d.pct), sortOrder: i }));
  await db.insert(immoPriceTypes).values(ptRows);
  await db.insert(immoOptions).values(optRows);
  await db.insert(immoDiscounts).values(discRows);
  await db.update(companies).set({ immoSeeded: true }).where(eq(companies.id, companyId));
}

async function loadSettings(companyId: number) {
  const [pt, opt, disc] = await Promise.all([
    db.select().from(immoPriceTypes).where(eq(immoPriceTypes.companyId, companyId)).orderBy(immoPriceTypes.sortOrder, immoPriceTypes.id),
    db.select().from(immoOptions).where(eq(immoOptions.companyId, companyId)).orderBy(immoOptions.sortOrder, immoOptions.id),
    db.select().from(immoDiscounts).where(eq(immoDiscounts.companyId, companyId)).orderBy(immoDiscounts.sortOrder, immoDiscounts.id),
  ]);
  const mapType = (r: typeof immoPriceTypes.$inferSelect) => ({ id: r.id, key: r.key, label: r.label, basePrice: Math.round(Number(r.basePrice)) });
  const mapOpt = (r: typeof immoOptions.$inferSelect) => ({ id: r.id, name: r.name, pct: Number(r.pct) });
  return {
    locationTypes: pt.filter((r) => r.kind === 'location').map(mapType),
    venteTypes: pt.filter((r) => r.kind === 'vente').map(mapType),
    locationOptions: opt.filter((r) => r.kind === 'location').map(mapOpt),
    venteOptions: opt.filter((r) => r.kind === 'vente').map(mapOpt),
    discounts: disc.map((r) => ({ id: r.id, name: r.name, pct: Number(r.pct) })),
  };
}

meImmoSettingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    await seedDefaultsIfEmpty(companyId);
    res.json({ canWrite: g.canWrite, ...(await loadSettings(companyId)) });
  }),
);

const priceTypesSchema = z.object({
  items: z.array(z.object({
    key: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
    basePrice: z.coerce.number().int().min(0).max(999_999_999),
  })).max(500),
});
meImmoSettingsRouter.put(
  '/price-types/:kind',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const kind: 'location' | 'vente' | null = req.params.kind === 'vente' ? 'vente' : req.params.kind === 'location' ? 'location' : null;
    if (!companyId || !kind) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = priceTypesSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    await db.delete(immoPriceTypes).where(and(eq(immoPriceTypes.companyId, companyId), eq(immoPriceTypes.kind, kind)));
    if (p.data.items.length) {
      await db.insert(immoPriceTypes).values(p.data.items.map((it, i) => ({ companyId, kind, key: it.key, label: it.label, basePrice: String(it.basePrice), sortOrder: i })));
    }
    emitInvalidate(['irs', `company:${companyId}`], [['immo-settings', companyId]]);
    res.json({ ok: true });
  }),
);

const optionsSchema = z.object({
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    pct: z.coerce.number().min(0).max(1000),
  })).max(200),
});
meImmoSettingsRouter.put(
  '/options/:kind',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const kind: 'location' | 'vente' | null = req.params.kind === 'vente' ? 'vente' : req.params.kind === 'location' ? 'location' : null;
    if (!companyId || !kind) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = optionsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    await db.delete(immoOptions).where(and(eq(immoOptions.companyId, companyId), eq(immoOptions.kind, kind)));
    if (p.data.items.length) {
      await db.insert(immoOptions).values(p.data.items.map((it, i) => ({ companyId, kind, name: it.name, pct: String(round2(it.pct)), sortOrder: i })));
    }
    emitInvalidate(['irs', `company:${companyId}`], [['immo-settings', companyId]]);
    res.json({ ok: true });
  }),
);

const discountsSchema = z.object({
  items: z.array(z.object({
    name: z.string().trim().min(1).max(150),
    pct: z.coerce.number().min(0).max(1000),
  })).max(200),
});
meImmoSettingsRouter.put(
  '/discounts',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'immobilier');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = discountsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    await db.delete(immoDiscounts).where(eq(immoDiscounts.companyId, companyId));
    if (p.data.items.length) {
      await db.insert(immoDiscounts).values(p.data.items.map((it, i) => ({ companyId, name: it.name, pct: String(round2(it.pct)), sortOrder: i })));
    }
    emitInvalidate(['irs', `company:${companyId}`], [['immo-settings', companyId]]);
    res.json({ ok: true });
  }),
);
