import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { LOYALTY_TIERS, LOYALTY_TIER_KEYS, moduleConfigBool } from '@rp-compta/shared';
import { db } from '../db';
import { companyClients, clientLoyaltyTiers, companyModules, concessionSales, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  getModuleAccess,
  canManageCompany,
  hasSpecialPermission,
  actionDenied,
  type PermAction,
} from '../services/access';
import { emitInvalidate } from '../realtime/socket';
import { recordAudit } from '../services/audit';

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(c: typeof companyClients.$inferSelect) {
  return {
    id: c.id,
    companyId: c.companyId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    loyaltyTier: c.loyaltyTier,
    loyaltyPoints: c.loyaltyPoints,
    totalSpent: Number(c.totalSpent),
    accountBalance: Number(c.accountBalance),
    creditLimit: Number(c.creditLimit),
    createdAt: c.createdAt,
  };
}

const posMoney = z.number().nonnegative().finite().max(9_999_999_999.99);
const signedMoney = z.number().finite().min(-9_999_999_999.99).max(9_999_999_999.99);

const bodySchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(50).nullish().or(z.literal('')),
  email: z.string().trim().email().max(150).optional().or(z.literal('')),
  notes: z.string().max(2000).nullish().or(z.literal('')),
  loyaltyTier: z.enum(LOYALTY_TIER_KEYS as [string, ...string[]]).optional(),
  loyaltyPoints: z.number().int().min(0).max(100_000_000).optional(),
  totalSpent: posMoney.optional(),
  accountBalance: signedMoney.optional(),
  creditLimit: posMoney.optional(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const blank = (v: string | null | undefined) => (v ? v : null);

function toRow(d: z.infer<typeof bodySchema>) {
  return {
    name: d.name,
    phone: blank(d.phone),
    email: blank(d.email),
    notes: blank(d.notes),
    loyaltyTier: (d.loyaltyTier ?? 'bronze') as (typeof companyClients.$inferInsert)['loyaltyTier'],
    loyaltyPoints: d.loyaltyPoints ?? 0,
    totalSpent: String(round2(d.totalSpent ?? 0)),
    accountBalance: String(round2(d.accountBalance ?? 0)),
    creditLimit: String(round2(d.creditLimit ?? 0)),
  };
}

export const meClientsRouter = Router({ mergeParams: true });
meClientsRouter.use(requireAuth);

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'clients');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite, canCreate: acc.canCreate, canEdit: acc.canEdit, canDelete: acc.canDelete };
}

meClientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(companyClients)
      .where(eq(companyClients.companyId, companyId))
      .orderBy(asc(companyClients.name));
    res.json({ canWrite: g.canWrite, clients: rows.map(serialize) });
  }),
);

meClientsRouter.get(
  '/:id/purchases',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: concessionSales.id,
        vehicleName: concessionSales.vehicleName,
        plate: concessionSales.plate,
        salePrice: concessionSales.salePrice,
        sellerName: users.displayName,
        createdAt: concessionSales.createdAt,
      })
      .from(concessionSales)
      .leftJoin(users, eq(concessionSales.createdByUserId, users.id))
      .where(and(eq(concessionSales.companyId, companyId), eq(concessionSales.clientId, id)))
      .orderBy(desc(concessionSales.id))
      .limit(100);
    res.json({
      purchases: rows.map((r) => ({ ...r, salePrice: Math.round(Number(r.salePrice)) })),
    });
  }),
);

meClientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(companyClients).values({ companyId, createdByUserId: req.user!.id, ...toRow(parsed.data) });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meClientsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const set: Record<string, unknown> = {
      name: d.name,
      phone: blank(d.phone),
      email: blank(d.email),
      notes: blank(d.notes),
      loyaltyTier: (d.loyaltyTier ?? 'bronze') as (typeof companyClients.$inferInsert)['loyaltyTier'],
      creditLimit: String(round2(d.creditLimit ?? 0)),
    };
    if (d.loyaltyPoints !== undefined) set.loyaltyPoints = d.loyaltyPoints;
    if (d.totalSpent !== undefined) set.totalSpent = String(round2(d.totalSpent));
    if (d.accountBalance !== undefined) set.accountBalance = String(round2(d.accountBalance));
    const result = await db
      .update(companyClients)
      .set(set)
      .where(and(eq(companyClients.id, id), eq(companyClients.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.json({ ok: true });
  }),
);

meClientsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(companyClients)
      .where(and(eq(companyClients.id, id), eq(companyClients.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'client_delete',
      targetType: 'client',
      targetLabel: `#${id}`,
      detail: `entreprise ${companyId}`,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.json({ ok: true });
  }),
);

const balanceSchema = z.object({ delta: signedMoney, reason: z.string().trim().max(200).optional() });

meClientsRouter.post(
  '/:id/balance',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'clients');
    if (!acc || !acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });
    const cm = await db
      .select({ config: companyModules.config })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'clients')))
      .limit(1);
    if (!moduleConfigBool(cm[0]?.config as Record<string, unknown> | null, 'clients', 'credit')) {
      return res.status(403).json({ error: 'module_unavailable' });
    }
    if (!(await hasSpecialPermission(req.user!.id, companyId, 'clients', 'adjust_balance'))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const parsed = balanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(companyClients)
      .set({ accountBalance: sql`${companyClients.accountBalance} + ${round2(parsed.data.delta)}` })
      .where(and(eq(companyClients.id, id), eq(companyClients.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.json({ ok: true });
  }),
);

export const meLoyaltyRouter = Router({ mergeParams: true });
meLoyaltyRouter.use(requireAuth);

meLoyaltyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(clientLoyaltyTiers)
      .where(eq(clientLoyaltyTiers.companyId, companyId));
    const byTier = new Map(rows.map((r) => [r.tier, r]));
    const tiers = LOYALTY_TIERS.map((t) => {
      const r = byTier.get(t.key);
      return { tier: t.key, name: r?.name ?? t.label, threshold: r?.threshold ?? 0 };
    });
    res.json({ canManage: await canManageCompany(req.user!.id, companyId), tiers });
  }),
);

const tiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        tier: z.enum(LOYALTY_TIER_KEYS as [string, ...string[]]),
        name: z.string().trim().min(1).max(60),
        threshold: z.number().int().min(0).max(100_000_000),
      }),
    )
    .max(LOYALTY_TIER_KEYS.length)
    .refine((g) => new Set(g.map((r) => r.tier)).size === g.length, 'duplicate_tier'),
});

meLoyaltyRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'clients');
    if (!acc || !acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    const parsed = tiersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.transaction(async (tx) => {
      for (const t of parsed.data.tiers) {
        await tx
          .insert(clientLoyaltyTiers)
          .values({
            companyId,
            tier: t.tier as (typeof clientLoyaltyTiers.$inferInsert)['tier'],
            name: t.name,
            threshold: t.threshold,
          })
          .onDuplicateKeyUpdate({ set: { name: t.name, threshold: t.threshold } });
      }
    });
    emitInvalidate(['irs', `company:${companyId}`], [['loyalty-tiers', companyId], ['clients', companyId]]);
    res.json({ ok: true });
  }),
);
