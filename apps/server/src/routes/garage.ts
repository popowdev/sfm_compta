import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  garageContracts,
  garageContractPrices,
  garageVehicles,
  garageRepairTypes,
  garagePacks,
  garageSettings,
  garageRepairs,
  garageCustoms,
  users,
  memberships,
  companyRoles,
  companyEmployees,
  vehicleModels,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, isStaff } from '../services/access';
import { bizDate, bizWeek } from '../services/bizTime';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'garage');
  if (!acc) return { error: 404 as const };
  if (!acc.enabled || acc.blocked) return { error: 403 as const };
  if (!acc.canView) return { error: 403 as const };
  return { acc };
}

const money = z.coerce.number().nonnegative().finite().max(9_999_999.99);
const pct = z.coerce.number().min(0).max(100);

async function commissionPctFor(companyId: number, mechanicUserId: number | null | undefined, fallback: number): Promise<number> {
  if (mechanicUserId) {
    const [emp] = await db
      .select({ rate: companyEmployees.commissionRate })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.userId, mechanicUserId), eq(companyEmployees.active, true)))
      .limit(1);
    if (emp && Number(emp.rate) > 0) return Number(emp.rate);
  }
  return fallback;
}

async function ensureSeed(companyId: number) {
  const s = await db.select({ companyId: garageSettings.companyId }).from(garageSettings).where(eq(garageSettings.companyId, companyId)).limit(1);
  if (!s[0]) {
    await db.insert(garageSettings).values({ companyId }).catch(() => {});
  }
  const t = await db.select({ id: garageRepairTypes.id }).from(garageRepairTypes).where(eq(garageRepairTypes.companyId, companyId)).limit(1);
  if (!t[0]) {
    await db.insert(garageRepairTypes).values([
      { companyId, name: 'Moteur', price: '100', sortOrder: 1 },
      { companyId, name: 'Chassis', price: '100', sortOrder: 2 },
      { companyId, name: 'Pneu', price: '150', sortOrder: 3 },
      { companyId, name: 'Suspension', price: '150', sortOrder: 4 },
    ]).catch(() => {});
  }
}

async function ownsContract(companyId: number, id: number): Promise<boolean> {
  const [r] = await db.select({ id: garageContracts.id }).from(garageContracts).where(and(eq(garageContracts.id, id), eq(garageContracts.companyId, companyId))).limit(1);
  return !!r;
}
async function ownsVehicle(companyId: number, id: number): Promise<boolean> {
  const [r] = await db.select({ id: garageVehicles.id }).from(garageVehicles).where(and(eq(garageVehicles.id, id), eq(garageVehicles.companyId, companyId))).limit(1);
  return !!r;
}

export const meGarageRouter = Router({ mergeParams: true });
meGarageRouter.use(requireAuth);

// ---- Config (paramètres + types + packs) ----
meGarageRouter.get('/config', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  await ensureSeed(companyId);
  const [settings] = await db.select().from(garageSettings).where(eq(garageSettings.companyId, companyId)).limit(1);
  const types = await db.select().from(garageRepairTypes).where(eq(garageRepairTypes.companyId, companyId)).orderBy(garageRepairTypes.sortOrder);
  const packs = await db.select().from(garagePacks).where(eq(garagePacks.companyId, companyId)).orderBy(garagePacks.name);
  res.json({
    canWrite: g.acc!.canWrite,
    settings: {
      depannagePerKm: Number(settings?.depannagePerKm ?? 25),
      depannageMultiplier: settings?.depannageMultiplier ?? 2,
      customMarginPct: Number(settings?.customMarginPct ?? 25),
      commissionPct: Number(settings?.commissionPct ?? 30),
    },
    types: types.map((t) => ({ id: t.id, name: t.name, price: Number(t.price), active: t.active })),
    packs: packs.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), active: p.active })),
  });
}));

meGarageRouter.get('/members', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const rows = await db
    .select({ userId: users.id, name: users.displayName, gradeName: companyRoles.name, commissionRate: companyEmployees.commissionRate })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .leftJoin(companyEmployees, and(eq(companyEmployees.userId, users.id), eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)))
    .where(and(eq(memberships.companyId, companyId), eq(memberships.active, true)));
  res.json({ members: rows.map((r) => ({ userId: r.userId, name: r.name, gradeName: r.gradeName, commissionRate: r.commissionRate != null ? Number(r.commissionRate) : null })) });
}));

meGarageRouter.get('/earnings', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const rep = await db
    .select({
      userId: garageRepairs.mechanicUserId, name: garageRepairs.mechanicName,
      commission: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}),0)`,
      revenue: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)`, count: sql<number>`COUNT(*)`,
    })
    .from(garageRepairs).where(eq(garageRepairs.companyId, companyId))
    .groupBy(garageRepairs.mechanicUserId, garageRepairs.mechanicName);
  const cus = await db
    .select({
      userId: garageCustoms.mechanicUserId, name: garageCustoms.mechanicName,
      commission: sql<string>`COALESCE(SUM(${garageCustoms.commissionAmount}),0)`,
      revenue: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}),0)`, count: sql<number>`COUNT(*)`,
    })
    .from(garageCustoms).where(eq(garageCustoms.companyId, companyId))
    .groupBy(garageCustoms.mechanicUserId, garageCustoms.mechanicName);
  const map = new Map<string, { name: string; commission: number; revenue: number; count: number }>();
  for (const r of [...rep, ...cus]) {
    const k = r.userId ? `u${r.userId}` : `n${(r.name || '').toLowerCase()}`;
    const e = map.get(k) ?? { name: r.name || '—', commission: 0, revenue: 0, count: 0 };
    e.commission += Number(r.commission);
    e.revenue += Number(r.revenue);
    e.count += Number(r.count);
    if ((!e.name || e.name === '—') && r.name) e.name = r.name;
    map.set(k, e);
  }
  res.json({ earnings: [...map.values()].sort((a, b) => b.commission - a.commission) });
}));

meGarageRouter.get('/billing', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });

  const { monday: mon, sunday: sun } = bizWeek();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromQ = typeof req.query.from === 'string' && dateRe.test(req.query.from) ? req.query.from : mon;
  const toQ = typeof req.query.to === 'string' && dateRe.test(req.query.to) ? req.query.to : sun;

  const repWhere = and(eq(garageRepairs.companyId, companyId), sql`${garageRepairs.contractId} IS NOT NULL`, gte(bizDate(garageRepairs.createdAt), fromQ), lte(bizDate(garageRepairs.createdAt), toQ));
  const cusWhere = and(eq(garageCustoms.companyId, companyId), sql`${garageCustoms.contractId} IS NOT NULL`, gte(bizDate(garageCustoms.createdAt), fromQ), lte(bizDate(garageCustoms.createdAt), toQ));

  const [rep, cus, contracts] = await Promise.all([
    db.select({ contractId: garageRepairs.contractId, count: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)` }).from(garageRepairs).where(repWhere).groupBy(garageRepairs.contractId),
    db.select({ contractId: garageCustoms.contractId, count: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}),0)` }).from(garageCustoms).where(cusWhere).groupBy(garageCustoms.contractId),
    db.select({ id: garageContracts.id, name: garageContracts.name, active: garageContracts.active }).from(garageContracts).where(eq(garageContracts.companyId, companyId)),
  ]);
  const repById = new Map(rep.map((r) => [r.contractId, r]));
  const cusById = new Map(cus.map((c) => [c.contractId, c]));
  const rows = contracts
    .map((c) => {
      const r = repById.get(c.id);
      const cu = cusById.get(c.id);
      const repairsTotal = Math.round(Number(r?.total ?? 0));
      const customsTotal = Math.round(Number(cu?.total ?? 0));
      return { contractId: c.id, name: c.name, active: c.active, repairsCount: Number(r?.count ?? 0), repairsTotal, customsCount: Number(cu?.count ?? 0), customsTotal, total: repairsTotal + customsTotal };
    })
    .filter((x) => x.repairsCount || x.customsCount || x.active)
    .sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  res.json({ from: fromQ, to: toQ, rows, grandTotal });
}));

async function requireWrite(req: Request, companyId: number, res: import('express').Response): Promise<boolean> {
  const g = await gate(req, companyId);
  if (g.error) { res.status(g.error).json({ error: 'forbidden' }); return false; }
  if (!g.acc!.canWrite) { res.status(403).json({ error: 'forbidden' }); return false; }
  return true;
}

meGarageRouter.put('/settings', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const schema = z.object({ depannagePerKm: money, depannageMultiplier: z.coerce.number().int().min(1).max(10), customMarginPct: pct, commissionPct: pct });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await ensureSeed(companyId);
  await db.update(garageSettings)
    .set({ depannagePerKm: p.data.depannagePerKm.toFixed(2), depannageMultiplier: p.data.depannageMultiplier, customMarginPct: p.data.customMarginPct.toFixed(2), commissionPct: p.data.commissionPct.toFixed(2) })
    .where(eq(garageSettings.companyId, companyId));
  res.json({ ok: true });
}));

const namePrice = z.object({ name: z.string().trim().min(1).max(80), price: money });

meGarageRouter.post('/types', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = namePrice.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.insert(garageRepairTypes).values({ companyId, name: p.data.name, price: p.data.price.toFixed(2), sortOrder: 99 });
  res.status(201).json({ ok: true });
}));
meGarageRouter.patch('/types/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = namePrice.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  const set: Record<string, unknown> = {};
  if (p.data.name !== undefined) set.name = p.data.name;
  if (p.data.price !== undefined) set.price = p.data.price.toFixed(2);
  if (Object.keys(set).length) await db.update(garageRepairTypes).set(set).where(and(eq(garageRepairTypes.id, id), eq(garageRepairTypes.companyId, companyId)));
  res.json({ ok: true });
}));
meGarageRouter.delete('/types/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  await db.delete(garageRepairTypes).where(and(eq(garageRepairTypes.id, id), eq(garageRepairTypes.companyId, companyId)));
  res.json({ ok: true });
}));

meGarageRouter.post('/packs', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = namePrice.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.insert(garagePacks).values({ companyId, name: p.data.name, price: p.data.price.toFixed(2) });
  res.status(201).json({ ok: true });
}));
meGarageRouter.delete('/packs/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  await db.delete(garagePacks).where(and(eq(garagePacks.id, id), eq(garagePacks.companyId, companyId)));
  res.json({ ok: true });
}));

// ---- Contrats ----
const contractSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  prices: z
    .array(
      z.object({
        typeId: z.coerce.number().int().positive().nullish(),
        packId: z.coerce.number().int().positive().nullish(),
        price: z.coerce.number().min(0).max(9_999_999),
      }),
    )
    .max(200)
    .optional(),
});

async function saveContractPrices(
  companyId: number,
  contractId: number,
  prices: { typeId?: number | null; packId?: number | null; price: number }[] | undefined,
): Promise<void> {
  await db.delete(garageContractPrices).where(eq(garageContractPrices.contractId, contractId));
  if (!prices?.length) return;
  const [typeRows, packRows] = await Promise.all([
    db.select({ id: garageRepairTypes.id }).from(garageRepairTypes).where(eq(garageRepairTypes.companyId, companyId)),
    db.select({ id: garagePacks.id }).from(garagePacks).where(eq(garagePacks.companyId, companyId)),
  ]);
  const typeIds = new Set(typeRows.map((r) => r.id));
  const packIds = new Set(packRows.map((r) => r.id));
  const rows = prices
    .map((p) => {
      const typeId = p.typeId && typeIds.has(p.typeId) ? p.typeId : null;
      const packId = !typeId && p.packId && packIds.has(p.packId) ? p.packId : null;
      return { contractId, typeId, packId, price: p.price.toFixed(2) };
    })
    .filter((r) => r.typeId !== null || r.packId !== null);
  if (rows.length) await db.insert(garageContractPrices).values(rows);
}

meGarageRouter.get('/contracts', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const rows = await db.select().from(garageContracts).where(eq(garageContracts.companyId, companyId)).orderBy(garageContracts.name);
  const priceRows = rows.length
    ? await db.select().from(garageContractPrices).where(inArray(garageContractPrices.contractId, rows.map((r) => r.id)))
    : [];
  const byContract = new Map<number, { typeId: number | null; packId: number | null; price: number }[]>();
  for (const pr of priceRows) {
    const arr = byContract.get(pr.contractId) ?? [];
    arr.push({ typeId: pr.typeId, packId: pr.packId, price: Number(pr.price) });
    byContract.set(pr.contractId, arr);
  }
  res.json({ canWrite: g.acc!.canWrite, contracts: rows.map((r) => ({ ...r, prices: byContract.get(r.id) ?? [] })) });
}));
meGarageRouter.post('/contracts', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = contractSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  const ins = await db.insert(garageContracts).values({ companyId, name: p.data.name, description: p.data.description || null });
  await saveContractPrices(companyId, ins[0].insertId, p.data.prices);
  res.status(201).json({ ok: true });
}));
meGarageRouter.patch('/contracts/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = contractSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  const owned = await db.select({ id: garageContracts.id }).from(garageContracts).where(and(eq(garageContracts.id, id), eq(garageContracts.companyId, companyId))).limit(1);
  if (!owned[0]) return res.status(404).json({ error: 'not_found' });
  await db.update(garageContracts).set({ name: p.data.name, description: p.data.description || null }).where(eq(garageContracts.id, id));
  await saveContractPrices(companyId, id, p.data.prices);
  res.json({ ok: true });
}));
meGarageRouter.delete('/contracts/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  await db.delete(garageContracts).where(and(eq(garageContracts.id, id), eq(garageContracts.companyId, companyId)));
  res.json({ ok: true });
}));

// ---- Véhicules ----
meGarageRouter.get('/vehicles', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q
    ? and(eq(garageVehicles.companyId, companyId), like(garageVehicles.plate, `%${q}%`))
    : eq(garageVehicles.companyId, companyId);
  const rows = await db.select().from(garageVehicles).where(where).orderBy(desc(garageVehicles.id)).limit(q ? 20 : 500);
  res.json({ canWrite: g.acc!.canWrite, vehicles: rows });
}));
const vehicleSchema = z.object({
  ownerFirstName: z.string().trim().max(80).optional(),
  ownerLastName: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  plate: z.string().trim().min(1).max(20),
});
meGarageRouter.post('/vehicles', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = vehicleSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.insert(garageVehicles).values({
    companyId,
    ownerFirstName: p.data.ownerFirstName || null,
    ownerLastName: p.data.ownerLastName || null,
    model: p.data.model || null,
    plate: p.data.plate.toUpperCase(),
  });
  res.status(201).json({ ok: true });
}));
meGarageRouter.patch('/vehicles/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = vehicleSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.update(garageVehicles)
    .set({ ownerFirstName: p.data.ownerFirstName || null, ownerLastName: p.data.ownerLastName || null, model: p.data.model || null, plate: p.data.plate.toUpperCase() })
    .where(and(eq(garageVehicles.id, id), eq(garageVehicles.companyId, companyId)));
  res.json({ ok: true });
}));
meGarageRouter.delete('/vehicles/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  await db.delete(garageVehicles).where(and(eq(garageVehicles.id, id), eq(garageVehicles.companyId, companyId)));
  res.json({ ok: true });
}));

// ---- Base de modèles de véhicules (globale, partagée) ----
meGarageRouter.get('/models', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rows = q
    ? await db.select().from(vehicleModels).where(like(vehicleModels.name, `%${q}%`)).orderBy(vehicleModels.name).limit(25)
    : await db.select().from(vehicleModels).orderBy(vehicleModels.category, vehicleModels.name).limit(60);
  res.json({ canWrite: g.acc!.canWrite, canManageCatalog: await isStaff(req.user!.id), models: rows });
}));

const modelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  manufacturer: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
});
meGarageRouter.post('/models', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = modelSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.insert(vehicleModels).values({ name: p.data.name, manufacturer: p.data.manufacturer || null, category: p.data.category || null });
  res.status(201).json({ ok: true });
}));
meGarageRouter.patch('/models/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  if (!(await isStaff(req.user!.id))) return res.status(403).json({ error: 'forbidden' });
  const p = modelSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.update(vehicleModels).set({ name: p.data.name, manufacturer: p.data.manufacturer || null, category: p.data.category || null }).where(eq(vehicleModels.id, id));
  res.json({ ok: true });
}));
meGarageRouter.delete('/models/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  if (!(await isStaff(req.user!.id))) return res.status(403).json({ error: 'forbidden' });
  await db.delete(vehicleModels).where(eq(vehicleModels.id, id));
  res.json({ ok: true });
}));

// ---- Réparations ----
function parseItemsCol(v: unknown): { name: string; price: number }[] | null {
  if (Array.isArray(v)) return v as { name: string; price: number }[];
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

meGarageRouter.get('/repairs', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const rows = await db.select().from(garageRepairs).where(eq(garageRepairs.companyId, companyId)).orderBy(desc(garageRepairs.id)).limit(300);
  res.json({
    canWrite: g.acc!.canWrite,
    repairs: rows.map((r) => ({
      ...r,
      total: Number(r.total),
      commissionAmount: Number(r.commissionAmount),
      items: parseItemsCol(r.items),
    })),
  });
}));

const repairSchema = z.object({
  mechanicName: z.string().trim().max(140).optional(),
  mechanicUserId: z.coerce.number().int().positive().nullish(),
  contractId: z.coerce.number().int().positive().nullish(),
  clientName: z.string().trim().max(140).optional(),
  vehicleId: z.coerce.number().int().positive().nullish(),
  plate: z.string().trim().max(20).optional(),
  model: z.string().trim().max(120).optional(),
  packId: z.coerce.number().int().positive().nullish(),
  typeIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
  depannageKm: z.coerce.number().int().min(0).max(100000).optional(),
  description: z.string().trim().max(2000).optional(),
});

meGarageRouter.post('/repairs', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = repairSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  const d = p.data;
  if (d.contractId && !(await ownsContract(companyId, d.contractId))) return res.status(400).json({ error: 'bad_request' });
  if (d.vehicleId && !(await ownsVehicle(companyId, d.vehicleId))) return res.status(400).json({ error: 'bad_request' });
  await ensureSeed(companyId);
  const [settings] = await db.select().from(garageSettings).where(eq(garageSettings.companyId, companyId)).limit(1);
  const perKm = Number(settings?.depannagePerKm ?? 25);
  const mult = settings?.depannageMultiplier ?? 2;
  const commissionPct = Number(settings?.commissionPct ?? 30);

  const cTypePrices = new Map<number, number>();
  const cPackPrices = new Map<number, number>();
  if (d.contractId) {
    const cp = await db.select().from(garageContractPrices).where(eq(garageContractPrices.contractId, d.contractId));
    for (const r of cp) {
      if (r.typeId) cTypePrices.set(r.typeId, Number(r.price));
      if (r.packId) cPackPrices.set(r.packId, Number(r.price));
    }
  }

  let base = 0;
  let packName: string | null = null;
  const items: { name: string; price: number }[] = [];
  if (d.packId) {
    const [pack] = await db.select().from(garagePacks).where(and(eq(garagePacks.id, d.packId), eq(garagePacks.companyId, companyId))).limit(1);
    if (!pack) return res.status(400).json({ error: 'invalid_pack' });
    base = cPackPrices.get(pack.id) ?? Number(pack.price); packName = pack.name;
  } else if (d.typeIds?.length) {
    const types = await db.select().from(garageRepairTypes).where(eq(garageRepairTypes.companyId, companyId));
    for (const id of d.typeIds) {
      const t = types.find((x) => x.id === id);
      if (t) { const price = cTypePrices.get(t.id) ?? Number(t.price); items.push({ name: t.name, price }); base += price; }
    }
    if (items.length === 0) return res.status(400).json({ error: 'invalid_types' });
  }
  const km = d.depannageKm ?? 0;
  const depannage = km * perKm * mult;
  const total = Math.round(base + depannage);
  const effectivePct = await commissionPctFor(companyId, d.mechanicUserId, commissionPct);
  const commissionAmount = Math.round((total * effectivePct) / 100);

  await db.insert(garageRepairs).values({
    companyId,
    contractId: d.contractId ?? null,
    vehicleId: d.vehicleId ?? null,
    mechanicUserId: d.mechanicUserId ?? null,
    mechanicName: d.mechanicName || '',
    clientName: d.clientName || null,
    plate: d.plate ? d.plate.toUpperCase() : null,
    model: d.model || null,
    packName,
    items: items.length ? items : null,
    depannageKm: km,
    total: total.toFixed(2),
    commissionAmount: commissionAmount.toFixed(2),
    description: d.description || null,
    createdByUserId: req.user!.id,
  });
  res.status(201).json({ ok: true, total });
}));

meGarageRouter.patch('/repairs/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = z.object({ paid: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.update(garageRepairs).set({ paid: p.data.paid }).where(and(eq(garageRepairs.id, id), eq(garageRepairs.companyId, companyId)));
  res.json({ ok: true });
}));
meGarageRouter.delete('/repairs/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  await db.delete(garageRepairs).where(and(eq(garageRepairs.id, id), eq(garageRepairs.companyId, companyId)));
  res.json({ ok: true });
}));

// ---- Customs ----
meGarageRouter.get('/customs', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (g.error) return res.status(g.error).json({ error: 'forbidden' });
  const rows = await db.select().from(garageCustoms).where(eq(garageCustoms.companyId, companyId)).orderBy(desc(garageCustoms.id)).limit(300);
  res.json({ canWrite: g.acc!.canWrite, customs: rows.map((c) => ({ ...c, costPrice: Number(c.costPrice), discountPct: Number(c.discountPct), marginPct: Number(c.marginPct), finalPrice: Number(c.finalPrice), profit: Number(c.profit), commissionAmount: Number(c.commissionAmount) })) });
}));

const customSchema = z.object({
  mechanicName: z.string().trim().max(140).optional(),
  mechanicUserId: z.coerce.number().int().positive().nullish(),
  contractId: z.coerce.number().int().positive().nullish(),
  clientName: z.string().trim().max(140).optional(),
  vehicleId: z.coerce.number().int().positive().nullish(),
  plate: z.string().trim().max(20).optional(),
  model: z.string().trim().max(120).optional(),
  costPrice: money,
  discountPct: pct.optional(),
  description: z.string().trim().max(2000).optional(),
});

meGarageRouter.post('/customs', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = customSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  const d = p.data;
  if (d.contractId && !(await ownsContract(companyId, d.contractId))) return res.status(400).json({ error: 'bad_request' });
  if (d.vehicleId && !(await ownsVehicle(companyId, d.vehicleId))) return res.status(400).json({ error: 'bad_request' });
  await ensureSeed(companyId);
  const [settings] = await db.select().from(garageSettings).where(eq(garageSettings.companyId, companyId)).limit(1);
  const margin = Number(settings?.customMarginPct ?? 25);
  const commissionPct = Number(settings?.commissionPct ?? 30);
  const discount = d.discountPct ?? 0;
  const base = d.costPrice * (1 + margin / 100);
  const finalPrice = Math.round(base * (1 - discount / 100));
  const profit = Math.round(finalPrice - d.costPrice);
  const effectivePct = await commissionPctFor(companyId, d.mechanicUserId, commissionPct);
  const commissionAmount = Math.round((Math.max(0, profit) * effectivePct) / 100);
  await db.insert(garageCustoms).values({
    companyId,
    contractId: d.contractId ?? null,
    vehicleId: d.vehicleId ?? null,
    mechanicUserId: d.mechanicUserId ?? null,
    mechanicName: d.mechanicName || '',
    clientName: d.clientName || null,
    plate: d.plate ? d.plate.toUpperCase() : null,
    model: d.model || null,
    costPrice: d.costPrice.toFixed(2),
    discountPct: discount.toFixed(2),
    marginPct: margin.toFixed(2),
    finalPrice: finalPrice.toFixed(2),
    profit: profit.toFixed(2),
    commissionAmount: commissionAmount.toFixed(2),
    description: d.description || null,
    createdByUserId: req.user!.id,
  });
  res.status(201).json({ ok: true, finalPrice, profit });
}));

meGarageRouter.patch('/customs/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  const p = z.object({ paid: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  await db.update(garageCustoms).set({ paid: p.data.paid }).where(and(eq(garageCustoms.id, id), eq(garageCustoms.companyId, companyId)));
  res.json({ ok: true });
}));
meGarageRouter.delete('/customs/:id', asyncHandler(async (req, res) => {
  const companyId = parseId(req.params.companyId); const id = parseId(req.params.id);
  if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
  if (!(await requireWrite(req, companyId, res))) return;
  await db.delete(garageCustoms).where(and(eq(garageCustoms.id, id), eq(garageCustoms.companyId, companyId)));
  res.json({ ok: true });
}));
