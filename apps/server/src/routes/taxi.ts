import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import {
  taxiSettings,
  taxiVipTypes,
  taxiCitoyens,
  taxiConcitoyens,
  taxiVip,
  memberships,
  users,
  companyRoles,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitCompta } from '../realtime/socket';
import { bizDate } from '../services/bizTime';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
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
  return { ok: true as const, canWrite: acc.canWrite, canManage: acc.canDelete };
}

async function getSettings(companyId: number) {
  const [s] = await db.select().from(taxiSettings).where(eq(taxiSettings.companyId, companyId)).limit(1);
  if (s) return s;
  await db.insert(taxiSettings).values({ companyId }).catch(() => {});
  const [s2] = await db.select().from(taxiSettings).where(eq(taxiSettings.companyId, companyId)).limit(1);
  return s2;
}

const listQuery = z.object({
  driverId: z.coerce.number().int().positive().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  sort: z.enum(['recent', 'oldest', 'amount']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
function dateFilters(col: typeof taxiCitoyens.createdAt, from?: string, to?: string) {
  return [
    from ? gte(bizDate(col), from) : undefined,
    to ? lte(bizDate(col), to) : undefined,
  ].filter(Boolean);
}

export const meTaxiRouter = Router({ mergeParams: true });
meTaxiRouter.use(requireAuth);

meTaxiRouter.get(
  '/config',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const s = await getSettings(companyId);
    const vip = await db.select().from(taxiVipTypes).where(eq(taxiVipTypes.companyId, companyId)).orderBy(taxiVipTypes.sortOrder, taxiVipTypes.id);
    const drivers = await db
      .select({ userId: users.id, name: users.displayName, gradeName: companyRoles.name })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
      .where(and(eq(memberships.companyId, companyId), eq(memberships.active, true)));
    res.json({
      canWrite: g.canWrite,
      settings: { pricePerKm: Number(s?.pricePerKm ?? 20), pricePerClient: Number(s?.pricePerClient ?? 605) },
      vipTypes: vip.map((v) => ({ id: v.id, name: v.name, fixedPrice: Number(v.fixedPrice), pricePerKm: v.pricePerKm === null ? null : Number(v.pricePerKm), active: v.active })),
      drivers,
    });
  }),
);

const settingsSchema = z.object({ pricePerKm: money, pricePerClient: money });
meTaxiRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const p = settingsSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    await getSettings(companyId);
    await db.update(taxiSettings).set({ pricePerKm: String(round2(p.data.pricePerKm)), pricePerClient: String(round2(p.data.pricePerClient)) }).where(eq(taxiSettings.companyId, companyId));
    emitCompta(companyId, [['taxi-config', companyId]]);
    res.json({ ok: true });
  }),
);

const vipTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  fixedPrice: money,
  pricePerKm: money.nullish(),
});
meTaxiRouter.post(
  '/vip-types',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const p = vipTypeSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const inserted = await db.insert(taxiVipTypes).values({
      companyId,
      name: p.data.name,
      fixedPrice: String(round2(p.data.fixedPrice)),
      pricePerKm: p.data.pricePerKm == null ? null : String(round2(p.data.pricePerKm)),
    });
    emitCompta(companyId, [['taxi-config', companyId]]);
    res.status(201).json({ ok: true, id: Number(inserted[0].insertId) });
  }),
);
meTaxiRouter.patch(
  '/vip-types/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const p = vipTypeSchema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const patch: Record<string, unknown> = {};
    if (p.data.name !== undefined) patch.name = p.data.name;
    if (p.data.fixedPrice !== undefined) patch.fixedPrice = String(round2(p.data.fixedPrice));
    if (p.data.pricePerKm !== undefined) patch.pricePerKm = p.data.pricePerKm == null ? null : String(round2(p.data.pricePerKm));
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const r = await db.update(taxiVipTypes).set(patch).where(and(eq(taxiVipTypes.id, id), eq(taxiVipTypes.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-config', companyId]]);
    res.json({ ok: true });
  }),
);
meTaxiRouter.delete(
  '/vip-types/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const r = await db.delete(taxiVipTypes).where(and(eq(taxiVipTypes.id, id), eq(taxiVipTypes.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-config', companyId]]);
    res.json({ ok: true });
  }),
);

function orderFor(table: typeof taxiCitoyens, sort: string) {
  if (sort === 'oldest') return asc(table.createdAt);
  if (sort === 'amount') return desc(table.total);
  return desc(table.createdAt);
}
function resolveDriver(req: Request, driverUserId?: number | null, driverName?: string | null) {
  return { driverUserId: driverUserId ?? req.user!.id, driverName: (driverName ?? req.user!.displayName ?? '').slice(0, 120) };
}

meTaxiRouter.get(
  '/citoyens',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const qp = listQuery.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: 'bad_request' });
    const { driverId, from, to, sort, page, limit } = qp.data;
    const where = and(
      eq(taxiCitoyens.companyId, companyId),
      driverId ? eq(taxiCitoyens.driverUserId, driverId) : undefined,
      ...dateFilters(taxiCitoyens.createdAt, from, to),
    );
    const [countRows, rows, statRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(taxiCitoyens).where(where),
      db.select().from(taxiCitoyens).where(where).orderBy(orderFor(taxiCitoyens, sort)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`COUNT(*)`, km: sql<number>`COALESCE(SUM(${taxiCitoyens.km}),0)`, revenue: sql<number>`COALESCE(SUM(${taxiCitoyens.total}),0)` }).from(taxiCitoyens).where(where),
    ]);
    res.json({
      canWrite: g.canWrite,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      stats: { count: Number(statRows[0]?.n ?? 0), km: round2(Number(statRows[0]?.km ?? 0)), revenue: round2(Number(statRows[0]?.revenue ?? 0)) },
      rows: rows.map((r) => ({ id: r.id, driverUserId: r.driverUserId, driverName: r.driverName, km: Number(r.km), pricePerKm: Number(r.pricePerKm), total: Number(r.total), notes: r.notes, createdAt: r.createdAt })),
    });
  }),
);

const citoyenSchema = z.object({
  driverUserId: z.coerce.number().int().positive().nullish(),
  driverName: z.string().trim().max(120).nullish(),
  km: money,
  notes: z.string().max(2000).nullish(),
});
meTaxiRouter.post(
  '/citoyens',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = citoyenSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const s = await getSettings(companyId);
    const ppk = Number(s?.pricePerKm ?? 20);
    const total = round2(p.data.km * ppk);
    const d = resolveDriver(req, p.data.driverUserId, p.data.driverName);
    const ins = await db.insert(taxiCitoyens).values({ companyId, ...d, km: String(round2(p.data.km)), pricePerKm: String(ppk), total: String(total), notes: p.data.notes || null, createdByUserId: req.user!.id });
    emitCompta(companyId, [['taxi-citoyens', companyId]]);
    res.status(201).json({ ok: true, id: Number(ins[0].insertId), total });
  }),
);
meTaxiRouter.patch(
  '/citoyens/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = citoyenSchema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const patch: Record<string, unknown> = {};
    if (p.data.driverUserId !== undefined) patch.driverUserId = p.data.driverUserId ?? null;
    if (p.data.driverName !== undefined) patch.driverName = (p.data.driverName ?? '').slice(0, 120);
    if (p.data.km !== undefined) {
      const s = await getSettings(companyId);
      const ppk = Number(s?.pricePerKm ?? 20);
      patch.km = String(round2(p.data.km));
      patch.pricePerKm = String(ppk);
      patch.total = String(round2(p.data.km * ppk));
    }
    if (p.data.notes !== undefined) patch.notes = p.data.notes || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const r = await db.update(taxiCitoyens).set(patch).where(and(eq(taxiCitoyens.id, id), eq(taxiCitoyens.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-citoyens', companyId]]);
    res.json({ ok: true });
  }),
);
meTaxiRouter.delete(
  '/citoyens/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const r = await db.delete(taxiCitoyens).where(and(eq(taxiCitoyens.id, id), eq(taxiCitoyens.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-citoyens', companyId]]);
    res.json({ ok: true });
  }),
);

meTaxiRouter.get(
  '/concitoyens',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const qp = listQuery.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: 'bad_request' });
    const { driverId, from, to, sort, page, limit } = qp.data;
    const where = and(
      eq(taxiConcitoyens.companyId, companyId),
      driverId ? eq(taxiConcitoyens.driverUserId, driverId) : undefined,
      ...dateFilters(taxiConcitoyens.createdAt as never, from, to),
    );
    const [countRows, rows, statRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(taxiConcitoyens).where(where),
      db.select().from(taxiConcitoyens).where(where).orderBy(orderFor(taxiConcitoyens as never, sort)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`COUNT(*)`, clients: sql<number>`COALESCE(SUM(${taxiConcitoyens.clients}),0)`, revenue: sql<number>`COALESCE(SUM(${taxiConcitoyens.total}),0)` }).from(taxiConcitoyens).where(where),
    ]);
    res.json({
      canWrite: g.canWrite,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      stats: { count: Number(statRows[0]?.n ?? 0), clients: Number(statRows[0]?.clients ?? 0), revenue: round2(Number(statRows[0]?.revenue ?? 0)) },
      rows: rows.map((r) => ({ id: r.id, driverUserId: r.driverUserId, driverName: r.driverName, clients: r.clients, pricePerClient: Number(r.pricePerClient), total: Number(r.total), notes: r.notes, createdAt: r.createdAt })),
    });
  }),
);

const concitoyenSchema = z.object({
  driverUserId: z.coerce.number().int().positive().nullish(),
  driverName: z.string().trim().max(120).nullish(),
  clients: z.coerce.number().int().min(1).max(100000),
  notes: z.string().max(2000).nullish(),
});
meTaxiRouter.post(
  '/concitoyens',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = concitoyenSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const s = await getSettings(companyId);
    const ppc = Number(s?.pricePerClient ?? 605);
    const total = round2(p.data.clients * ppc);
    const d = resolveDriver(req, p.data.driverUserId, p.data.driverName);
    const ins = await db.insert(taxiConcitoyens).values({ companyId, ...d, clients: p.data.clients, pricePerClient: String(ppc), total: String(total), notes: p.data.notes || null, createdByUserId: req.user!.id });
    emitCompta(companyId, [['taxi-concitoyens', companyId]]);
    res.status(201).json({ ok: true, id: Number(ins[0].insertId), total });
  }),
);
meTaxiRouter.patch(
  '/concitoyens/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = concitoyenSchema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const patch: Record<string, unknown> = {};
    if (p.data.driverUserId !== undefined) patch.driverUserId = p.data.driverUserId ?? null;
    if (p.data.driverName !== undefined) patch.driverName = (p.data.driverName ?? '').slice(0, 120);
    if (p.data.clients !== undefined) {
      const s = await getSettings(companyId);
      const ppc = Number(s?.pricePerClient ?? 605);
      patch.clients = p.data.clients;
      patch.pricePerClient = String(ppc);
      patch.total = String(round2(p.data.clients * ppc));
    }
    if (p.data.notes !== undefined) patch.notes = p.data.notes || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const r = await db.update(taxiConcitoyens).set(patch).where(and(eq(taxiConcitoyens.id, id), eq(taxiConcitoyens.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-concitoyens', companyId]]);
    res.json({ ok: true });
  }),
);
meTaxiRouter.delete(
  '/concitoyens/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const r = await db.delete(taxiConcitoyens).where(and(eq(taxiConcitoyens.id, id), eq(taxiConcitoyens.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-concitoyens', companyId]]);
    res.json({ ok: true });
  }),
);

meTaxiRouter.get(
  '/vip',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const qp = listQuery.safeParse(req.query);
    if (!qp.success) return res.status(400).json({ error: 'bad_request' });
    const { driverId, from, to, sort, page, limit } = qp.data;
    const where = and(
      eq(taxiVip.companyId, companyId),
      driverId ? eq(taxiVip.driverUserId, driverId) : undefined,
      ...dateFilters(taxiVip.createdAt as never, from, to),
    );
    const [countRows, rows, statRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(taxiVip).where(where),
      db.select().from(taxiVip).where(where).orderBy(orderFor(taxiVip as never, sort)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`COUNT(*)`, revenue: sql<number>`COALESCE(SUM(${taxiVip.total}),0)` }).from(taxiVip).where(where),
    ]);
    res.json({
      canWrite: g.canWrite,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      stats: { count: Number(statRows[0]?.n ?? 0), revenue: round2(Number(statRows[0]?.revenue ?? 0)) },
      rows: rows.map((r) => ({ id: r.id, driverUserId: r.driverUserId, driverName: r.driverName, typeId: r.typeId, typeName: r.typeName, km: r.km === null ? null : Number(r.km), total: Number(r.total), notes: r.notes, createdAt: r.createdAt })),
    });
  }),
);

const vipSchema = z.object({
  driverUserId: z.coerce.number().int().positive().nullish(),
  driverName: z.string().trim().max(120).nullish(),
  typeId: z.coerce.number().int().positive(),
  km: money.nullish(),
  notes: z.string().max(2000).nullish(),
});
async function vipTotal(companyId: number, typeId: number, km: number | null | undefined): Promise<{ typeName: string; total: number } | null> {
  const [t] = await db.select().from(taxiVipTypes).where(and(eq(taxiVipTypes.id, typeId), eq(taxiVipTypes.companyId, companyId))).limit(1);
  if (!t) return null;
  const perKm = t.pricePerKm === null ? 0 : Number(t.pricePerKm);
  const total = round2(Number(t.fixedPrice) + (km ?? 0) * perKm);
  return { typeName: t.name, total };
}
meTaxiRouter.post(
  '/vip',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = vipSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const calc = await vipTotal(companyId, p.data.typeId, p.data.km);
    if (!calc) return res.status(400).json({ error: 'invalid_type' });
    const d = resolveDriver(req, p.data.driverUserId, p.data.driverName);
    const ins = await db.insert(taxiVip).values({ companyId, ...d, typeId: p.data.typeId, typeName: calc.typeName, km: p.data.km == null ? null : String(round2(p.data.km)), total: String(calc.total), notes: p.data.notes || null, createdByUserId: req.user!.id });
    emitCompta(companyId, [['taxi-vip', companyId]]);
    res.status(201).json({ ok: true, id: Number(ins[0].insertId), total: calc.total });
  }),
);
meTaxiRouter.patch(
  '/vip/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = vipSchema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const [existing] = await db.select().from(taxiVip).where(and(eq(taxiVip.id, id), eq(taxiVip.companyId, companyId))).limit(1);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const patch: Record<string, unknown> = {};
    if (p.data.driverUserId !== undefined) patch.driverUserId = p.data.driverUserId ?? null;
    if (p.data.driverName !== undefined) patch.driverName = (p.data.driverName ?? '').slice(0, 120);
    if (p.data.notes !== undefined) patch.notes = p.data.notes || null;
    if (p.data.typeId !== undefined || p.data.km !== undefined) {
      const typeId = p.data.typeId ?? existing.typeId ?? 0;
      const km = p.data.km !== undefined ? p.data.km : existing.km === null ? null : Number(existing.km);
      const calc = await vipTotal(companyId, typeId, km);
      if (!calc) return res.status(400).json({ error: 'invalid_type' });
      patch.typeId = typeId;
      patch.typeName = calc.typeName;
      patch.km = km == null ? null : String(round2(km));
      patch.total = String(calc.total);
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    await db.update(taxiVip).set(patch).where(and(eq(taxiVip.id, id), eq(taxiVip.companyId, companyId)));
    emitCompta(companyId, [['taxi-vip', companyId]]);
    res.json({ ok: true });
  }),
);
meTaxiRouter.delete(
  '/vip/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, 'taxi');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const r = await db.delete(taxiVip).where(and(eq(taxiVip.id, id), eq(taxiVip.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['taxi-vip', companyId]]);
    res.json({ ok: true });
  }),
);
