import { Router, type Request } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { moduleConfigBool, moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import { concessionVehicles, concessionSales, companies, companyModules, companyEmployees, companyClients, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';
import { DEFAULT_CONCESSION_VEHICLES } from '../data/concessionDefaults';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const priceVal = z.coerce.number().nonnegative().finite().max(999_999_999);

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'concession');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

async function readModuleConfig(companyId: number): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ config: companyModules.config })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'concession')))
    .limit(1);
  const raw = rows[0]?.config ?? null;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
}

async function effectiveRate(companyId: number, cfg: Record<string, unknown> | null, sellerUserId: number): Promise<number> {
  if (moduleConfigBool(cfg, 'concession', 'commissionCustom')) return moduleConfigNumber(cfg, 'concession', 'commissionRate');
  const emp = await db
    .select({ rate: companyEmployees.commissionRate })
    .from(companyEmployees)
    .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.userId, sellerUserId), eq(companyEmployees.active, true)))
    .limit(1);
  return emp[0] ? Number(emp[0].rate) : 0;
}

async function seedIfEmpty(companyId: number) {
  const existing = await db.select({ id: concessionVehicles.id }).from(concessionVehicles).where(eq(concessionVehicles.companyId, companyId)).limit(1);
  if (existing[0]) return;
  const won = await db.update(companies).set({ concessionSeeded: true }).where(and(eq(companies.id, companyId), eq(companies.concessionSeeded, false)));
  if ((won[0].affectedRows ?? 0) === 0) return;
  const rows = DEFAULT_CONCESSION_VEHICLES.map((v, i) => ({
    companyId,
    name: v.name,
    category: v.category,
    type: v.type,
    purchasePrice: String(Math.round(v.purchasePrice)),
    salePrice: String(Math.round(v.salePrice)),
    imageUrl: v.imageUrl,
    sortOrder: i,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(concessionVehicles).values(rows.slice(i, i + 200));
  }
}

export const meConcessionRouter = Router({ mergeParams: true });
meConcessionRouter.use(requireAuth);

meConcessionRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    await seedIfEmpty(companyId);

    const vehicleRows = await db
      .select()
      .from(concessionVehicles)
      .where(eq(concessionVehicles.companyId, companyId))
      .orderBy(asc(concessionVehicles.sortOrder), asc(concessionVehicles.name));
    const vehicles = vehicleRows.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      type: v.type,
      purchasePrice: Math.round(Number(v.purchasePrice)),
      salePrice: Math.round(Number(v.salePrice)),
      imageUrl: v.imageUrl,
      description: v.description,
      available: v.available,
      showroom: v.showroom,
    }));

    const salesAgg = await db
      .select({
        revenue: sql<string>`COALESCE(SUM(${concessionSales.salePrice}), 0)`,
        cost: sql<string>`COALESCE(SUM(${concessionSales.purchasePrice}), 0)`,
        commission: sql<string>`COALESCE(SUM(${concessionSales.commission}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(concessionSales)
      .where(eq(concessionSales.companyId, companyId));
    const revenue = Math.round(Number(salesAgg[0]?.revenue ?? 0));
    const cost = Math.round(Number(salesAgg[0]?.cost ?? 0));
    const commissionsPaid = Math.round(Number(salesAgg[0]?.commission ?? 0));

    const pastClientRows = await db
      .select({ clientId: sql<number | null>`MAX(${concessionSales.clientId})`, name: concessionSales.clientName })
      .from(concessionSales)
      .where(and(eq(concessionSales.companyId, companyId), sql`${concessionSales.clientName} IS NOT NULL AND ${concessionSales.clientName} <> ''`))
      .groupBy(concessionSales.clientName)
      .orderBy(sql`MAX(${concessionSales.id}) DESC`)
      .limit(500);
    const pastClients = pastClientRows.map((r) => ({ clientId: r.clientId ?? null, name: r.name ?? '' })).filter((c) => c.name);

    const cfg = await readModuleConfig(companyId);
    const showroomEnabled = moduleConfigBool(cfg, 'concession', 'publicShowroom');
    const companyRow = await db.select({ token: companies.showroomToken }).from(companies).where(eq(companies.id, companyId)).limit(1);
    let token = companyRow[0]?.token ?? null;
    if (showroomEnabled && !token && g.canWrite) {
      token = randomBytes(16).toString('hex');
      await db.update(companies).set({ showroomToken: token }).where(eq(companies.id, companyId));
    }

    res.json({
      canWrite: g.canWrite,
      vehicles,
      summary: {
        catalogSize: vehicles.length,
        availableCount: vehicles.filter((v) => v.available).length,
        catalogValue: vehicles.filter((v) => v.available).reduce((a, v) => a + v.salePrice, 0),
        salesCount: Number(salesAgg[0]?.count ?? 0),
        revenue,
        margin: revenue - cost,
        commissionsPaid,
      },
      showroom: { enabled: showroomEnabled, token: showroomEnabled ? token : null },
      pastClients,
    });
  }),
);

const vehicleCreate = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(80).optional(),
  type: z.enum(['new', 'used']).optional(),
  purchasePrice: priceVal,
  salePrice: priceVal,
  imageUrl: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  showroom: z.boolean().optional(),
  available: z.boolean().optional(),
});
const vehiclePatch = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  type: z.enum(['new', 'used']).optional(),
  purchasePrice: priceVal.optional(),
  salePrice: priceVal.optional(),
  imageUrl: z.string().trim().max(255).nullish(),
  description: z.string().trim().max(2000).nullish(),
  showroom: z.boolean().optional(),
  available: z.boolean().optional(),
});

meConcessionRouter.post(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = vehicleCreate.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const maxOrder = await db.select({ m: sql<number>`COALESCE(MAX(${concessionVehicles.sortOrder}), 0)` }).from(concessionVehicles).where(eq(concessionVehicles.companyId, companyId));
    await db.insert(concessionVehicles).values({
      companyId,
      name: p.data.name,
      category: p.data.category || 'Autre',
      type: p.data.type ?? 'new',
      purchasePrice: String(Math.round(p.data.purchasePrice)),
      salePrice: String(Math.round(p.data.salePrice)),
      imageUrl: p.data.imageUrl || null,
      description: p.data.description || null,
      showroom: p.data.showroom ?? true,
      available: p.data.available ?? true,
      sortOrder: Number(maxOrder[0]?.m ?? 0) + 1,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['concession', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meConcessionRouter.patch(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = vehiclePatch.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const set: Record<string, unknown> = {};
    if (p.data.name !== undefined) set.name = p.data.name;
    if (p.data.category !== undefined) set.category = p.data.category;
    if (p.data.type !== undefined) set.type = p.data.type;
    if (p.data.purchasePrice !== undefined) set.purchasePrice = String(Math.round(p.data.purchasePrice));
    if (p.data.salePrice !== undefined) set.salePrice = String(Math.round(p.data.salePrice));
    if (p.data.imageUrl !== undefined) set.imageUrl = p.data.imageUrl || null;
    if (p.data.description !== undefined) set.description = p.data.description || null;
    if (p.data.showroom !== undefined) set.showroom = p.data.showroom;
    if (p.data.available !== undefined) set.available = p.data.available;
    if (!Object.keys(set).length) return res.status(400).json({ error: 'bad_request' });
    await db.update(concessionVehicles).set(set).where(and(eq(concessionVehicles.id, id), eq(concessionVehicles.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['concession', companyId]]);
    res.json({ ok: true });
  }),
);

meConcessionRouter.delete(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    await db.delete(concessionVehicles).where(and(eq(concessionVehicles.id, id), eq(concessionVehicles.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['concession', companyId]]);
    res.json({ ok: true });
  }),
);

meConcessionRouter.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: concessionSales.id,
        vehicleId: concessionSales.vehicleId,
        clientId: concessionSales.clientId,
        vehicleName: concessionSales.vehicleName,
        clientName: concessionSales.clientName,
        plate: concessionSales.plate,
        purchasePrice: concessionSales.purchasePrice,
        salePrice: concessionSales.salePrice,
        commission: concessionSales.commission,
        note: concessionSales.note,
        authorName: users.displayName,
        createdAt: concessionSales.createdAt,
      })
      .from(concessionSales)
      .leftJoin(users, eq(concessionSales.createdByUserId, users.id))
      .where(eq(concessionSales.companyId, companyId))
      .orderBy(desc(concessionSales.id))
      .limit(300);
    res.json({
      canWrite: g.canWrite,
      sales: rows.map((r) => ({
        ...r,
        purchasePrice: Math.round(Number(r.purchasePrice)),
        salePrice: Math.round(Number(r.salePrice)),
        commission: Math.round(Number(r.commission)),
        margin: Math.round(Number(r.salePrice)) - Math.round(Number(r.purchasePrice)),
      })),
    });
  }),
);

const saleCreate = z.object({
  vehicleId: z.coerce.number().int().positive().nullish(),
  clientId: z.coerce.number().int().positive().nullish(),
  vehicleName: z.string().trim().min(1).max(150),
  clientName: z.string().trim().max(120).optional(),
  plate: z.string().trim().max(20).optional(),
  purchasePrice: priceVal,
  salePrice: priceVal,
  note: z.string().trim().max(255).optional(),
});

meConcessionRouter.post(
  '/sales',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = saleCreate.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });

    let vehicleId: number | null = null;
    if (p.data.vehicleId) {
      const v = await db.select({ id: concessionVehicles.id }).from(concessionVehicles).where(and(eq(concessionVehicles.id, p.data.vehicleId), eq(concessionVehicles.companyId, companyId))).limit(1);
      if (v[0]) vehicleId = v[0].id;
    }

    let clientId: number | null = null;
    let clientName = p.data.clientName || null;
    if (p.data.clientId) {
      const c = await db.select({ id: companyClients.id, name: companyClients.name }).from(companyClients).where(and(eq(companyClients.id, p.data.clientId), eq(companyClients.companyId, companyId))).limit(1);
      if (c[0]) { clientId = c[0].id; clientName = c[0].name; }
    }

    const cfg = await readModuleConfig(companyId);
    const salePrice = Math.round(p.data.salePrice);
    const purchasePrice = Math.round(p.data.purchasePrice);
    const rate = await effectiveRate(companyId, cfg, req.user!.id);
    const commission = Math.round((rate / 100) * salePrice);

    await db.insert(concessionSales).values({
      companyId,
      vehicleId,
      clientId,
      vehicleName: p.data.vehicleName,
      clientName,
      plate: p.data.plate ? p.data.plate.toUpperCase() : null,
      purchasePrice: String(purchasePrice),
      salePrice: String(salePrice),
      commission: String(commission),
      note: p.data.note || null,
      createdByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['concession', companyId]]);
    res.status(201).json({ ok: true, commission });
  }),
);

meConcessionRouter.delete(
  '/sales/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    await db.delete(concessionSales).where(and(eq(concessionSales.id, id), eq(concessionSales.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['concession', companyId]]);
    res.json({ ok: true });
  }),
);

meConcessionRouter.post(
  '/showroom/regenerate',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const token = randomBytes(16).toString('hex');
    await db.update(companies).set({ showroomToken: token }).where(eq(companies.id, companyId));
    emitInvalidate(['irs', `company:${companyId}`], [['concession', companyId]]);
    res.json({ ok: true, token });
  }),
);
