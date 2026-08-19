import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { moduleConfigBool, moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import {
  exercices,
  exercicePayroll,
  companyExpenses,
  companyEmployees,
  timeEntries,
  companyModules,
  sales,
  saleItems,
  stockMovements,
  companyClients,
  salaryGrid,
  companyRoles,
  garageRepairs,
  garageCustoms,
  taxiCitoyens,
  taxiConcitoyens,
  taxiVip,
  pawnshopTransactions,
  chasseTransactions,
  companyRuns,
  concessionSales,
  companyCargaisons,
  cargaisonParticipants,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { computeTaxes } from '../services/declarations';
import { emitInvalidate } from '../realtime/socket';
import { recordAudit } from '../services/audit';
import { bizDate, bizDayStr, bizWeek, bizPeakMinutes } from '../services/bizTime';

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const blank = (v: string | null | undefined) => (v ? v : null);

const isDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'exercices');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) {
    return { ok: false as const, status: 403, error: 'forbidden' };
  }
  return { ok: true as const, canWrite: acc.canWrite, canEdit: acc.canEdit };
}

function serialize(r: typeof exercices.$inferSelect) {
  return {
    id: r.id,
    companyId: r.companyId,
    label: r.label,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    revenue: Number(r.revenue),
    dividends: Number(r.dividends),
    hoursCap: Number(r.hoursCap),
    salaryCap: Number(r.salaryCap),
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

const money = z.number().nonnegative().finite().max(99_999_999_999.99);
const hoursVal = z.number().nonnegative().finite().max(99_999.99);

const createSchema = z
  .object({
    label: z.string().trim().min(1).max(150),
    startDate: z.string().refine(isDate, 'invalid_date'),
    endDate: z.string().refine(isDate, 'invalid_date'),
    revenue: money.optional(),
    dividends: money.optional(),
    hoursCap: hoursVal.optional(),
    salaryCap: money.optional(),
    notes: z.string().max(2000).nullish().or(z.literal('')),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'invalid_range' })
  .refine(
    (d) => (Date.parse(`${d.endDate}T00:00:00Z`) - Date.parse(`${d.startDate}T00:00:00Z`)) / 86_400_000 <= 31,
    { message: 'range_too_long' },
  );

const updateSchema = z.object({
  label: z.string().trim().min(1).max(150).optional(),
  status: z.enum(['open', 'closed']).optional(),
  revenue: money.optional(),
  dividends: money.optional(),
  hoursCap: hoursVal.optional(),
  salaryCap: money.optional(),
  notes: z.string().max(2000).nullish().or(z.literal('')),
});

export const meExercicesRouter = Router({ mergeParams: true });
meExercicesRouter.use(requireAuth);

meExercicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(exercices)
      .where(eq(exercices.companyId, companyId))
      .orderBy(desc(exercices.startDate));
    res.json({ canWrite: g.canWrite, exercices: rows.map(serialize) });
  }),
);

meExercicesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    try {
      await db.insert(exercices).values({
        companyId,
        createdByUserId: req.user!.id,
        label: parsed.data.label,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        revenue: String(round2(parsed.data.revenue ?? 0)),
        dividends: String(round2(parsed.data.dividends ?? 0)),
        hoursCap: String(round2(parsed.data.hoursCap ?? 0)),
        salaryCap: String(round2(parsed.data.salaryCap ?? 0)),
        notes: blank(parsed.data.notes),
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'duplicate_period' });
      }
      throw err;
    }
    emitInvalidate(['irs', `company:${companyId}`], [['exercices', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

const weekSchema = z.object({ offset: z.number().int().min(-520).max(520).optional() });

meExercicesRouter.post(
  '/generate-week',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = weekSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const offset = parsed.data.offset ?? 0;

    const { monday: startStr, sunday: endStr, label } = bizWeek(new Date(), offset);

    const existing = await db
      .select({ id: exercices.id })
      .from(exercices)
      .where(
        and(
          eq(exercices.companyId, companyId),
          eq(exercices.startDate, startStr),
          eq(exercices.endDate, endStr),
        ),
      )
      .limit(1);
    if (existing[0]) return res.json({ ok: true, id: existing[0].id, existing: true });

    try {
      const ins = await db.insert(exercices).values({
        companyId,
        createdByUserId: req.user!.id,
        label,
        startDate: startStr,
        endDate: endStr,
      });
      emitInvalidate(['irs', `company:${companyId}`], [['exercices', companyId]]);
      return res.status(201).json({ ok: true, id: ins[0].insertId, existing: false });
    } catch (err) {
      if ((err as { code?: string }).code !== 'ER_DUP_ENTRY') throw err;
      const again = await db
        .select({ id: exercices.id })
        .from(exercices)
        .where(
          and(
            eq(exercices.companyId, companyId),
            eq(exercices.startDate, startStr),
            eq(exercices.endDate, endStr),
          ),
        )
        .limit(1);
      return res.json({ ok: true, id: again[0]?.id, existing: true });
    }
  }),
);

meExercicesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const set: Record<string, unknown> = {};
    if (d.label !== undefined) set.label = d.label;
    if (d.status !== undefined) {
      set.status = d.status;
      if (d.status === 'open') set.snapshot = null; // reopening unfreezes → recompute live
      if (d.status === 'closed') {
        const [ex] = await db
          .select({ endDate: exercices.endDate })
          .from(exercices)
          .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)))
          .limit(1);
        if (!ex) return res.status(404).json({ error: 'not_found' });
        if (ex.endDate >= bizWeek().monday) return res.status(409).json({ error: 'week_not_over' });
      }
    }
    if (d.revenue !== undefined) set.revenue = String(round2(d.revenue));
    if (d.dividends !== undefined) set.dividends = String(round2(d.dividends));
    if (d.hoursCap !== undefined) set.hoursCap = String(round2(d.hoursCap));
    if (d.salaryCap !== undefined) set.salaryCap = String(round2(d.salaryCap));
    if (d.notes !== undefined) set.notes = blank(d.notes);
    if (Object.keys(set).length === 0) return res.json({ ok: true });
    const result = await db
      .update(exercices)
      .set(set)
      .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    if (d.status === 'closed') await snapshotExerciceIfClosed(companyId, id);
    emitInvalidate(['irs', `company:${companyId}`], [['exercices', companyId], ['exercice', companyId, id]]);
    res.json({ ok: true });
  }),
);

meExercicesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(exercices)
      .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'exercice_delete',
      targetType: 'exercice',
      targetLabel: `#${id}`,
      detail: `entreprise ${companyId}`,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['exercices', companyId]]);
    res.json({ ok: true });
  }),
);

async function buildExerciceDetail(companyId: number, id: number) {
    const exRows = await db
      .select()
      .from(exercices)
      .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)))
      .limit(1);
    if (!exRows[0]) return null;
    const ex = serialize(exRows[0]);

    const cmRows = await db
      .select({ config: companyModules.config })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'exercices')))
      .limit(1);
    const rawExConfig = cmRows[0]?.config;
    const exConfig = (
      typeof rawExConfig === 'string' ? JSON.parse(rawExConfig) : rawExConfig
    ) as Record<string, unknown> | null;
    const dividendsEnabled = moduleConfigBool(exConfig, 'exercices', 'dividends');
    const effectiveDividends = dividendsEnabled ? ex.dividends : 0;

    const bmRows = await db
      .select({ config: companyModules.config })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'badgeuse')))
      .limit(1);
    const rawBadgeuseConfig = bmRows[0]?.config;
    const badgeuseConfig = (
      typeof rawBadgeuseConfig === 'string' ? JSON.parse(rawBadgeuseConfig) : rawBadgeuseConfig
    ) as Record<string, unknown> | null;
    const weeklyHoursCap = moduleConfigNumber(badgeuseConfig, 'badgeuse', 'weeklyHoursCap');
    const peakEnabled = moduleConfigBool(badgeuseConfig, 'badgeuse', 'heuresPointe');
    const peakMultiplier = moduleConfigNumber(badgeuseConfig, 'badgeuse', 'pointeMultiplier');

    const modConfigRows = await db
      .select({ moduleKey: companyModules.moduleKey, config: companyModules.config })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), inArray(companyModules.moduleKey, ['taxi', 'pawnshop', 'caisse', 'garage', 'chasse'])));
    const parseCfg = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, unknown> | null;
    const taxiCfg = parseCfg(modConfigRows.find((r) => r.moduleKey === 'taxi')?.config ?? null);
    const pawnCfg = parseCfg(modConfigRows.find((r) => r.moduleKey === 'pawnshop')?.config ?? null);
    const chasseCfg = parseCfg(modConfigRows.find((r) => r.moduleKey === 'chasse')?.config ?? null);
    const caisseCfg = parseCfg(modConfigRows.find((r) => r.moduleKey === 'caisse')?.config ?? null);
    const garageCfg = parseCfg(modConfigRows.find((r) => r.moduleKey === 'garage')?.config ?? null);
    const taxiCommCustom = moduleConfigBool(taxiCfg, 'taxi', 'commissionCustom');
    const taxiCommRate = moduleConfigNumber(taxiCfg, 'taxi', 'commissionRate');
    const pawnCommCustom = moduleConfigBool(pawnCfg, 'pawnshop', 'commissionCustom');
    const pawnCommRate = moduleConfigNumber(pawnCfg, 'pawnshop', 'commissionRate');
    const chasseCommCustom = moduleConfigBool(chasseCfg, 'chasse', 'commissionCustom');
    const chasseCommRate = moduleConfigNumber(chasseCfg, 'chasse', 'commissionRate');
    const caisseCommCustom = moduleConfigBool(caisseCfg, 'caisse', 'commissionCustom');
    const caisseCommRate = moduleConfigNumber(caisseCfg, 'caisse', 'commissionRate');
    const garageCommCustom = moduleConfigBool(garageCfg, 'garage', 'commissionCustom');
    const garageCommRate = moduleConfigNumber(garageCfg, 'garage', 'commissionRate');

    const catRows = await db
      .select({
        category: companyExpenses.category,
        total: sql<string>`COALESCE(SUM(${companyExpenses.amount}), 0)`,
        deductible: sql<string>`COALESCE(SUM(CASE WHEN ${companyExpenses.taxDeductible} THEN ${companyExpenses.amount} ELSE 0 END), 0)`,
      })
      .from(companyExpenses)
      .where(
        and(
          eq(companyExpenses.companyId, companyId),
          ne(companyExpenses.category, 'salary'),
          gte(companyExpenses.expenseDate, ex.startDate),
          lte(companyExpenses.expenseDate, ex.endDate),
        ),
      )
      .groupBy(companyExpenses.category);
    const expensesByCategory = catRows
      .map((r) => ({ category: r.category, total: Number(r.total) }))
      .filter((r) => r.total !== 0)
      .sort((a, b) => b.total - a.total);
    const expensesTotal = round2(catRows.reduce((s, r) => s + Number(r.total), 0));
    const expensesDeductible = round2(catRows.reduce((s, r) => s + Number(r.deductible), 0));

    const overrideRows = await db
      .select()
      .from(exercicePayroll)
      .where(eq(exercicePayroll.exerciceId, id));
    const overrides = new Map(overrideRows.map((o) => [o.employeeId, o]));

    const payRows = await db
      .select({
        employeeId: companyEmployees.id,
        name: companyEmployees.name,
        companyRoleId: companyEmployees.companyRoleId,
        gradeName: companyRoles.name,
        hourlyRate: companyEmployees.hourlyRate,
        commissionRate: companyEmployees.commissionRate,
        workedMin: sql<string>`COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(MINUTE, ${timeEntries.clockIn}, ${timeEntries.clockOut}) - ${timeEntries.pauseMinutes})), 0)`,
      })
      .from(companyEmployees)
      .leftJoin(
        timeEntries,
        and(
          eq(timeEntries.employeeId, companyEmployees.id),
          eq(timeEntries.companyId, companyId),
          isNotNull(timeEntries.clockOut),
          gte(bizDate(timeEntries.clockIn), ex.startDate),
          lte(bizDate(timeEntries.clockIn), ex.endDate),
        ),
      )
      .leftJoin(companyRoles, eq(companyEmployees.companyRoleId, companyRoles.id))
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)))
      .groupBy(companyEmployees.id, companyRoles.name);

    const gridRows = await db.select().from(salaryGrid).where(eq(salaryGrid.companyId, companyId));
    const gridByRole = new Map(gridRows.map((g) => [g.companyRoleId, g]));

    const peakMinByEmp = new Map<number, number>();
    if (peakEnabled && peakMultiplier > 1) {
      const rawEntries = await db
        .select({ employeeId: timeEntries.employeeId, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.companyId, companyId),
            isNotNull(timeEntries.clockOut),
            gte(bizDate(timeEntries.clockIn), ex.startDate),
            lte(bizDate(timeEntries.clockIn), ex.endDate),
          ),
        );
      for (const e of rawEntries) {
        if (!e.clockOut) continue;
        const pm = bizPeakMinutes(e.clockIn, e.clockOut);
        if (pm > 0) peakMinByEmp.set(e.employeeId, (peakMinByEmp.get(e.employeeId) ?? 0) + pm);
      }
    }

    const garageEnabled = true;

    const salesWhere = and(
      eq(sales.companyId, companyId),
      gte(bizDate(sales.createdAt), ex.startDate),
      lte(bizDate(sales.createdAt), ex.endDate),
    );
    const itemsWhere = and(
      eq(saleItems.companyId, companyId),
      gte(bizDate(sales.createdAt), ex.startDate),
      lte(bizDate(sales.createdAt), ex.endDate),
    );
    const dayExpr = bizDayStr(sales.createdAt);

    const [aggRows, dayRows, payRowsAgg, perfRows, topRows, listRows, purchRows] = await Promise.all([
      db
        .select({
          gross: sql<string>`COALESCE(SUM(${sales.subtotal}), 0)`,
          discount: sql<string>`COALESCE(SUM(${sales.discount}), 0)`,
          net: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
          cost: sql<string>`COALESCE(SUM(${sales.productionCost}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .where(salesWhere),
      db
        .select({ date: dayExpr, total: sql<string>`COALESCE(SUM(${sales.total}), 0)` })
        .from(sales)
        .where(salesWhere)
        .groupBy(dayExpr),
      db
        .select({ method: sales.paymentMethod, total: sql<string>`COALESCE(SUM(${sales.total}), 0)`, count: sql<number>`COUNT(*)` })
        .from(sales)
        .where(salesWhere)
        .groupBy(sales.paymentMethod),
      db
        .select({
          employeeId: companyEmployees.id,
          name: companyEmployees.name,
          count: sql<number>`COUNT(${sales.id})`,
          ca: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
          discounts: sql<string>`COALESCE(SUM(${sales.discount}), 0)`,
        })
        .from(companyEmployees)
        .leftJoin(sales, and(eq(sales.employeeId, companyEmployees.id), salesWhere))
        .where(eq(companyEmployees.companyId, companyId))
        .groupBy(companyEmployees.id, companyEmployees.name)
        .orderBy(desc(sql`COALESCE(SUM(${sales.total}), 0)`)),
      db
        .select({
          name: saleItems.name,
          qty: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
          ca: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
          cost: sql<string>`COALESCE(SUM(${saleItems.productionCost}), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(itemsWhere)
        .groupBy(saleItems.name)
        .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
        .limit(20),
      db
        .select({
          id: sales.id,
          createdAt: sales.createdAt,
          subtotal: sales.subtotal,
          discount: sales.discount,
          total: sales.total,
          paymentMethod: sales.paymentMethod,
          employeeName: companyEmployees.name,
          clientName: companyClients.name,
        })
        .from(sales)
        .leftJoin(companyEmployees, eq(sales.employeeId, companyEmployees.id))
        .leftJoin(companyClients, eq(sales.clientId, companyClients.id))
        .where(salesWhere)
        .orderBy(desc(sales.createdAt))
        .limit(200),
      db
        .select({
          purchases: sql<string>`COALESCE(SUM(ABS(${stockMovements.quantity}) * ${stockMovements.unitCost}), 0)`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.companyId, companyId),
            eq(stockMovements.type, 'in'),
            isNotNull(stockMovements.unitCost),
            gte(bizDate(stockMovements.createdAt), ex.startDate),
            lte(bizDate(stockMovements.createdAt), ex.endDate),
          ),
        ),
    ]);

    let garageRevenue = 0;
    let garagePartsCost = 0;
    let garageTxCount = 0;
    const garageCommByEmp = new Map<number, number>();
    const garageRevByEmp = new Map<number, number>();
    const garageCountByEmp = new Map<number, number>();
    const garageByDay = new Map<string, number>();
    if (garageEnabled) {
      const repWhere = and(
        eq(garageRepairs.companyId, companyId),
        gte(bizDate(garageRepairs.createdAt), ex.startDate),
        lte(bizDate(garageRepairs.createdAt), ex.endDate),
      );
      const custWhere = and(
        eq(garageCustoms.companyId, companyId),
        gte(bizDate(garageCustoms.createdAt), ex.startDate),
        lte(bizDate(garageCustoms.createdAt), ex.endDate),
      );
      const gRepDay = bizDayStr(garageRepairs.createdAt);
      const gCustDay = bizDayStr(garageCustoms.createdAt);
      const [repByUser, custByUser, custTot, empUserRows, repDay, custDay] = await Promise.all([
        db
          .select({
            userId: garageRepairs.mechanicUserId,
            commission: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}),0)`,
            revenue: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)`,
            count: sql<number>`COUNT(*)`,
          })
          .from(garageRepairs)
          .where(repWhere)
          .groupBy(garageRepairs.mechanicUserId),
        db
          .select({
            userId: garageCustoms.mechanicUserId,
            commission: sql<string>`COALESCE(SUM(${garageCustoms.commissionAmount}),0)`,
            revenue: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}),0)`,
            count: sql<number>`COUNT(*)`,
          })
          .from(garageCustoms)
          .where(custWhere)
          .groupBy(garageCustoms.mechanicUserId),
        db
          .select({ cost: sql<string>`COALESCE(SUM(${garageCustoms.costPrice}),0)` })
          .from(garageCustoms)
          .where(custWhere),
        db
          .select({ id: companyEmployees.id, userId: companyEmployees.userId })
          .from(companyEmployees)
          .where(eq(companyEmployees.companyId, companyId)),
        db
          .select({ date: gRepDay, total: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)` })
          .from(garageRepairs)
          .where(repWhere)
          .groupBy(gRepDay),
        db
          .select({ date: gCustDay, total: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}),0)` })
          .from(garageCustoms)
          .where(custWhere)
          .groupBy(gCustDay),
      ]);
      const empByUser = new Map<number, number>();
      for (const e of empUserRows) if (e.userId != null) empByUser.set(e.userId, e.id);
      const addGarage = (userId: number | null, commission: number, revenue: number, count: number) => {
        garageRevenue += revenue;
        garageTxCount += count;
        if (userId == null) return;
        const empId = empByUser.get(userId);
        if (empId == null) return;
        garageCommByEmp.set(empId, (garageCommByEmp.get(empId) ?? 0) + commission);
        garageRevByEmp.set(empId, (garageRevByEmp.get(empId) ?? 0) + revenue);
        garageCountByEmp.set(empId, (garageCountByEmp.get(empId) ?? 0) + count);
      };
      for (const r of repByUser) addGarage(r.userId, Number(r.commission), Number(r.revenue), Number(r.count));
      for (const c of custByUser) addGarage(c.userId, Number(c.commission), Number(c.revenue), Number(c.count));
      for (const r of repDay) garageByDay.set(r.date, (garageByDay.get(r.date) ?? 0) + Number(r.total));
      for (const c of custDay) garageByDay.set(c.date, (garageByDay.get(c.date) ?? 0) + Number(c.total));
      garageRevenue = round2(garageRevenue);
      garagePartsCost = round2(Number(custTot[0]?.cost ?? 0));
    }

    const runsCommByEmp = new Map<number, number>();
    const runsRevByEmp = new Map<number, number>();
    const runsCountByEmp = new Map<number, number>();
    const runsByDay = new Map<string, number>();
    let runsRevenueTotal = 0;
    let runsTxCount = 0;
    {
      const [rows, runsDayRows] = await Promise.all([
        db
          .select({ employeeId: companyRuns.employeeId, comm: sql<string>`COALESCE(SUM(${companyRuns.commission}),0)`, total: sql<string>`COALESCE(SUM(${companyRuns.total}),0)`, count: sql<number>`COUNT(*)` })
          .from(companyRuns)
          .where(and(eq(companyRuns.companyId, companyId), gte(bizDate(companyRuns.createdAt), ex.startDate), lte(bizDate(companyRuns.createdAt), ex.endDate)))
          .groupBy(companyRuns.employeeId),
        db
          .select({ date: bizDayStr(companyRuns.createdAt), total: sql<string>`COALESCE(SUM(${companyRuns.total}),0)` })
          .from(companyRuns)
          .where(and(eq(companyRuns.companyId, companyId), gte(bizDate(companyRuns.createdAt), ex.startDate), lte(bizDate(companyRuns.createdAt), ex.endDate)))
          .groupBy(bizDayStr(companyRuns.createdAt)),
      ]);
      for (const r of rows) {
        runsRevenueTotal += Number(r.total);
        runsTxCount += Number(r.count);
        if (r.employeeId != null) {
          runsCommByEmp.set(r.employeeId, Number(r.comm));
          runsRevByEmp.set(r.employeeId, Number(r.total));
          runsCountByEmp.set(r.employeeId, Number(r.count));
        }
      }
      for (const r of runsDayRows) runsByDay.set(r.date, (runsByDay.get(r.date) ?? 0) + Number(r.total));
    }

    const cargaisonShareByEmp = new Map<number, number>();
    const cargaisonCountByEmp = new Map<number, number>();
    const cargaisonByDay = new Map<string, number>();
    let cargaisonRevenueTotal = 0;
    let cargaisonTxCount = 0;
    {
      const [revRows, cargaisonDayRows, partRows] = await Promise.all([
        db
          .select({ total: sql<string>`COALESCE(SUM(${companyCargaisons.total}),0)`, count: sql<number>`COUNT(*)` })
          .from(companyCargaisons)
          .where(and(eq(companyCargaisons.companyId, companyId), gte(bizDate(companyCargaisons.createdAt), ex.startDate), lte(bizDate(companyCargaisons.createdAt), ex.endDate))),
        db
          .select({ date: bizDayStr(companyCargaisons.createdAt), total: sql<string>`COALESCE(SUM(${companyCargaisons.total}),0)` })
          .from(companyCargaisons)
          .where(and(eq(companyCargaisons.companyId, companyId), gte(bizDate(companyCargaisons.createdAt), ex.startDate), lte(bizDate(companyCargaisons.createdAt), ex.endDate)))
          .groupBy(bizDayStr(companyCargaisons.createdAt)),
        db
          .select({ employeeId: cargaisonParticipants.employeeId, share: sql<string>`COALESCE(SUM(${cargaisonParticipants.share}),0)`, count: sql<number>`COUNT(*)` })
          .from(cargaisonParticipants)
          .innerJoin(companyCargaisons, eq(cargaisonParticipants.cargaisonId, companyCargaisons.id))
          .where(and(eq(companyCargaisons.companyId, companyId), gte(bizDate(companyCargaisons.createdAt), ex.startDate), lte(bizDate(companyCargaisons.createdAt), ex.endDate)))
          .groupBy(cargaisonParticipants.employeeId),
      ]);
      cargaisonRevenueTotal = Number(revRows[0]?.total ?? 0);
      cargaisonTxCount = Number(revRows[0]?.count ?? 0);
      for (const r of partRows) if (r.employeeId != null) {
        cargaisonShareByEmp.set(r.employeeId, Number(r.share));
        cargaisonCountByEmp.set(r.employeeId, Number(r.count));
      }
      for (const r of cargaisonDayRows) cargaisonByDay.set(r.date, (cargaisonByDay.get(r.date) ?? 0) + Number(r.total));
    }

    const taxiRevByEmp = new Map<number, number>();
    const pawnshopRevByEmp = new Map<number, number>();
    const chasseRevByEmp = new Map<number, number>();
    const concessionRevByEmp = new Map<number, number>();
    const concessionCommByEmp = new Map<number, number>();
    const concessionMarginByEmp = new Map<number, number>();
    const concessionCountByEmp = new Map<number, number>();
    const taxiCountByEmp = new Map<number, number>();
    const pawnshopCountByEmp = new Map<number, number>();
    const chasseCountByEmp = new Map<number, number>();
    const concessionByDay = new Map<string, number>();
    const otherModByDay = new Map<string, number>();
    let taxiRevenueTotal = 0;
    let pawnshopRevenueTotal = 0;
    let chasseRevenueTotal = 0;
    let concessionRevenueTotal = 0;
    let concessionTxCount = 0;
    let taxiTxCount = 0;
    let pawnshopTxCount = 0;
    let chasseTxCount = 0;
    {
      const empRows = await db
        .select({ id: companyEmployees.id, userId: companyEmployees.userId })
        .from(companyEmployees)
        .where(eq(companyEmployees.companyId, companyId));
      const empByUser = new Map<number, number>();
      for (const e of empRows) if (e.userId != null) empByUser.set(e.userId, e.id);
      const dTxCit = bizDayStr(taxiCitoyens.createdAt);
      const dTxCon = bizDayStr(taxiConcitoyens.createdAt);
      const dTxVip = bizDayStr(taxiVip.createdAt);
      const dPawn = bizDayStr(pawnshopTransactions.createdAt);
      const dChasse = bizDayStr(chasseTransactions.createdAt);
      const [txCit, txCon, txVip, pawnSell, chasseSell, concessionSell, concessionDay, txCitDay, txConDay, txVipDay, pawnDay, chasseDay] = await Promise.all([
        db.select({ userId: taxiCitoyens.driverUserId, total: sql<string>`COALESCE(SUM(${taxiCitoyens.total}),0)`, count: sql<number>`COUNT(*)` }).from(taxiCitoyens).where(and(eq(taxiCitoyens.companyId, companyId), gte(bizDate(taxiCitoyens.createdAt), ex.startDate), lte(bizDate(taxiCitoyens.createdAt), ex.endDate))).groupBy(taxiCitoyens.driverUserId),
        db.select({ userId: taxiConcitoyens.driverUserId, total: sql<string>`COALESCE(SUM(${taxiConcitoyens.total}),0)`, count: sql<number>`COUNT(*)` }).from(taxiConcitoyens).where(and(eq(taxiConcitoyens.companyId, companyId), gte(bizDate(taxiConcitoyens.createdAt), ex.startDate), lte(bizDate(taxiConcitoyens.createdAt), ex.endDate))).groupBy(taxiConcitoyens.driverUserId),
        db.select({ userId: taxiVip.driverUserId, total: sql<string>`COALESCE(SUM(${taxiVip.total}),0)`, count: sql<number>`COUNT(*)` }).from(taxiVip).where(and(eq(taxiVip.companyId, companyId), gte(bizDate(taxiVip.createdAt), ex.startDate), lte(bizDate(taxiVip.createdAt), ex.endDate))).groupBy(taxiVip.driverUserId),
        db.select({ userId: pawnshopTransactions.createdByUserId, total: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)`, count: sql<number>`COUNT(*)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.type, 'sell'), gte(bizDate(pawnshopTransactions.createdAt), ex.startDate), lte(bizDate(pawnshopTransactions.createdAt), ex.endDate))).groupBy(pawnshopTransactions.createdByUserId),
        db.select({ userId: chasseTransactions.createdByUserId, total: sql<string>`COALESCE(SUM(${chasseTransactions.total}),0)`, count: sql<number>`COUNT(*)` }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.type, 'sell'), gte(bizDate(chasseTransactions.createdAt), ex.startDate), lte(bizDate(chasseTransactions.createdAt), ex.endDate))).groupBy(chasseTransactions.createdByUserId),
        db.select({ userId: concessionSales.createdByUserId, comm: sql<string>`COALESCE(SUM(${concessionSales.commission}),0)`, total: sql<string>`COALESCE(SUM(${concessionSales.salePrice}),0)`, margin: sql<string>`COALESCE(SUM(${concessionSales.salePrice} - ${concessionSales.purchasePrice}),0)`, count: sql<number>`COUNT(*)` }).from(concessionSales).where(and(eq(concessionSales.companyId, companyId), gte(bizDate(concessionSales.createdAt), ex.startDate), lte(bizDate(concessionSales.createdAt), ex.endDate))).groupBy(concessionSales.createdByUserId),
        db.select({ date: bizDayStr(concessionSales.createdAt), total: sql<string>`COALESCE(SUM(${concessionSales.salePrice}),0)` }).from(concessionSales).where(and(eq(concessionSales.companyId, companyId), gte(bizDate(concessionSales.createdAt), ex.startDate), lte(bizDate(concessionSales.createdAt), ex.endDate))).groupBy(bizDayStr(concessionSales.createdAt)),
        db.select({ date: dTxCit, total: sql<string>`COALESCE(SUM(${taxiCitoyens.total}),0)` }).from(taxiCitoyens).where(and(eq(taxiCitoyens.companyId, companyId), gte(bizDate(taxiCitoyens.createdAt), ex.startDate), lte(bizDate(taxiCitoyens.createdAt), ex.endDate))).groupBy(dTxCit),
        db.select({ date: dTxCon, total: sql<string>`COALESCE(SUM(${taxiConcitoyens.total}),0)` }).from(taxiConcitoyens).where(and(eq(taxiConcitoyens.companyId, companyId), gte(bizDate(taxiConcitoyens.createdAt), ex.startDate), lte(bizDate(taxiConcitoyens.createdAt), ex.endDate))).groupBy(dTxCon),
        db.select({ date: dTxVip, total: sql<string>`COALESCE(SUM(${taxiVip.total}),0)` }).from(taxiVip).where(and(eq(taxiVip.companyId, companyId), gte(bizDate(taxiVip.createdAt), ex.startDate), lte(bizDate(taxiVip.createdAt), ex.endDate))).groupBy(dTxVip),
        db.select({ date: dPawn, total: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.type, 'sell'), gte(bizDate(pawnshopTransactions.createdAt), ex.startDate), lte(bizDate(pawnshopTransactions.createdAt), ex.endDate))).groupBy(dPawn),
        db.select({ date: dChasse, total: sql<string>`COALESCE(SUM(${chasseTransactions.total}),0)` }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.type, 'sell'), gte(bizDate(chasseTransactions.createdAt), ex.startDate), lte(bizDate(chasseTransactions.createdAt), ex.endDate))).groupBy(dChasse),
      ]);
      const addRev = (map: Map<number, number>, userId: number | null, total: number) => {
        if (userId == null) return;
        const empId = empByUser.get(userId);
        if (empId == null) return;
        map.set(empId, (map.get(empId) ?? 0) + total);
      };
      for (const r of txCit) { addRev(taxiRevByEmp, r.userId, Number(r.total)); addRev(taxiCountByEmp, r.userId, Number(r.count)); taxiRevenueTotal += Number(r.total); taxiTxCount += Number(r.count); }
      for (const r of txCon) { addRev(taxiRevByEmp, r.userId, Number(r.total)); addRev(taxiCountByEmp, r.userId, Number(r.count)); taxiRevenueTotal += Number(r.total); taxiTxCount += Number(r.count); }
      for (const r of txVip) { addRev(taxiRevByEmp, r.userId, Number(r.total)); addRev(taxiCountByEmp, r.userId, Number(r.count)); taxiRevenueTotal += Number(r.total); taxiTxCount += Number(r.count); }
      for (const r of pawnSell) { addRev(pawnshopRevByEmp, r.userId, Number(r.total)); addRev(pawnshopCountByEmp, r.userId, Number(r.count)); pawnshopRevenueTotal += Number(r.total); pawnshopTxCount += Number(r.count); }
      for (const r of chasseSell) { addRev(chasseRevByEmp, r.userId, Number(r.total)); addRev(chasseCountByEmp, r.userId, Number(r.count)); chasseRevenueTotal += Number(r.total); chasseTxCount += Number(r.count); }
      for (const r of concessionSell) {
        addRev(concessionRevByEmp, r.userId, Number(r.total));
        concessionRevenueTotal += Number(r.total);
        concessionTxCount += Number(r.count);
        const empId = r.userId != null ? empByUser.get(r.userId) : undefined;
        if (empId != null) {
          concessionCommByEmp.set(empId, (concessionCommByEmp.get(empId) ?? 0) + Number(r.comm));
          concessionMarginByEmp.set(empId, (concessionMarginByEmp.get(empId) ?? 0) + Number(r.margin));
          concessionCountByEmp.set(empId, (concessionCountByEmp.get(empId) ?? 0) + Number(r.count));
        }
      }
      for (const r of concessionDay) concessionByDay.set(r.date, (concessionByDay.get(r.date) ?? 0) + Number(r.total));
      for (const rows of [txCitDay, txConDay, txVipDay, pawnDay, chasseDay]) for (const r of rows) otherModByDay.set(r.date, (otherModByDay.get(r.date) ?? 0) + Number(r.total));
    }

    const caByEmp = new Map(perfRows.map((r) => [r.employeeId, Number(r.ca)]));
    const payroll = payRows.map((r) => {
      const rawHours = Number(r.workedMin) / 60;
      const hours = round2(rawHours);
      const caps = [ex.hoursCap, weeklyHoursCap].filter((c) => c > 0);
      const cappedHours = caps.length ? Math.min(rawHours, ...caps) : rawHours;
      const g = r.companyRoleId != null ? gridByRole.get(r.companyRoleId) : undefined;
      const rate = g && Number(g.hourlyRate) > 0 ? Number(g.hourlyRate) : Number(r.hourlyRate);
      const baseSalary = g ? Number(g.baseSalary) : 0;
      const base = Math.round(baseSalary + cappedHours * rate);
      const gradeRate = Number(r.commissionRate);
      const ca = caByEmp.get(r.employeeId) ?? 0;
      const autoCommission = Math.round(((caisseCommCustom ? caisseCommRate : gradeRate) / 100) * ca);
      const o = overrides.get(r.employeeId);
      const commission = autoCommission;
      const garageCommission = garageCommCustom
        ? Math.round((garageCommRate / 100) * (garageRevByEmp.get(r.employeeId) ?? 0))
        : Math.round(garageCommByEmp.get(r.employeeId) ?? 0);
      const taxiRate = (taxiCommCustom ? taxiCommRate : gradeRate) / 100;
      const pawnRate = (pawnCommCustom ? pawnCommRate : gradeRate) / 100;
      const chasseRate = (chasseCommCustom ? chasseCommRate : gradeRate) / 100;
      const taxiRevenue = Math.round(taxiRevByEmp.get(r.employeeId) ?? 0);
      const pawnshopRevenue = Math.round(pawnshopRevByEmp.get(r.employeeId) ?? 0);
      const chasseRevenue = Math.round(chasseRevByEmp.get(r.employeeId) ?? 0);
      const concessionRevenue = Math.round(concessionRevByEmp.get(r.employeeId) ?? 0);
      const taxiCommission = Math.round(taxiRate * taxiRevenue);
      const pawnshopCommission = Math.round(pawnRate * pawnshopRevenue);
      const chasseCommission = Math.round(chasseRate * chasseRevenue);
      const runsCommission = Math.round(runsCommByEmp.get(r.employeeId) ?? 0);
      const concessionCommission = Math.round(concessionCommByEmp.get(r.employeeId) ?? 0);
      const cargaisonShare = Math.round(cargaisonShareByEmp.get(r.employeeId) ?? 0);
      const bonus = o ? Math.round(Number(o.bonus)) : 0;
      const deductions = o ? Math.round(Number(o.deductions)) : 0;
      const peakHours = peakEnabled ? Math.min((peakMinByEmp.get(r.employeeId) ?? 0) / 60, cappedHours) : 0;
      const peakBonus = peakHours > 0 && peakMultiplier > 1 ? Math.round(peakHours * rate * (peakMultiplier - 1)) : 0;
      const theoretical = Math.max(0, base + commission + garageCommission + taxiCommission + pawnshopCommission + chasseCommission + runsCommission + concessionCommission + cargaisonShare + bonus + peakBonus - deductions);
      const paid = ex.salaryCap > 0 ? Math.min(theoretical, Math.round(ex.salaryCap)) : theoretical;
      return {
        employeeId: r.employeeId,
        name: r.name,
        companyRoleId: r.companyRoleId,
        gradeName: r.gradeName,
        hours,
        cappedHours: round2(cappedHours),
        peakHours: round2(peakHours),
        peakBonus,
        hourlyRate: rate,
        base,
        commission,
        garageCommission,
        taxiCommission,
        pawnshopCommission,
        chasseCommission,
        runsCommission,
        concessionCommission,
        cargaisonShare,
        taxiRevenue,
        pawnshopRevenue,
        chasseRevenue,
        concessionRevenue,
        bonus,
        deductions,
        theoretical,
        paid: Math.round(paid),
        excess: Math.round(Math.max(0, theoretical - paid)),
        notes: o?.notes ?? null,
        isPaid: o?.paid ?? false,
        paidAt: o?.paidAt ?? null,
      };
    });
    const payrollTotal = Math.round(payroll.reduce((s, p) => s + p.paid, 0));
    const excessToCompany = Math.round(payroll.reduce((s, p) => s + p.excess, 0));

    const salesGross = round2(Number(aggRows[0]?.gross ?? 0));
    const salesDiscount = round2(Number(aggRows[0]?.discount ?? 0));
    const salesNet = round2(Number(aggRows[0]?.net ?? 0));
    const productionCost = round2(Number(aggRows[0]?.cost ?? 0) + garagePartsCost);
    const salesCount = Number(aggRows[0]?.count ?? 0) + garageTxCount + concessionTxCount + taxiTxCount + pawnshopTxCount + chasseTxCount + runsTxCount + cargaisonTxCount;
    const componentPurchases = round2(Number(purchRows[0]?.purchases ?? 0));

    const moduleRevenue = round2(taxiRevenueTotal + pawnshopRevenueTotal + chasseRevenueTotal + runsRevenueTotal + concessionRevenueTotal + cargaisonRevenueTotal);
    const caGross = round2(salesGross + ex.revenue + garageRevenue + moduleRevenue);
    const caNet = round2(caGross - salesDiscount);
    const grossMargin = round2(caNet - productionCost);

    const charges = round2(expensesTotal + payrollTotal);
    const benefit = round2(caNet - charges);
    const taxableBenefit = round2(Math.max(0, benefit - expensesDeductible));
    const taxes = await computeTaxes(taxableBenefit, effectiveDividends);
    const effectiveRate = taxableBenefit > 0 ? round2((taxes.corporateTax / taxableBenefit) * 100) : 0;
    const netAfterTax = round2(benefit - taxes.corporateTax - effectiveDividends - taxes.dividendTax);

    const dayMap = new Map(dayRows.map((r) => [r.date, Number(r.total)]));
    const startMs = Date.parse(`${ex.startDate}T00:00:00Z`);
    const endMs = Date.parse(`${ex.endDate}T00:00:00Z`);
    const byDay: { date: string; total: number }[] = [];
    for (let t = startMs; t <= endMs; t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      byDay.push({ date: d, total: round2((dayMap.get(d) ?? 0) + (garageByDay.get(d) ?? 0) + (concessionByDay.get(d) ?? 0) + (otherModByDay.get(d) ?? 0) + (runsByDay.get(d) ?? 0) + (cargaisonByDay.get(d) ?? 0)) });
    }

    const detailBase = {
      ...ex,
      summary: {
        revenue: ex.revenue,
        salesRevenue: salesNet,
        garageRevenue,
        taxiRevenue: Math.round(taxiRevenueTotal),
        pawnshopRevenue: Math.round(pawnshopRevenueTotal),
        chasseRevenue: Math.round(chasseRevenueTotal),
        runsRevenue: Math.round(runsRevenueTotal),
        concessionRevenue: Math.round(concessionRevenueTotal),
        cargaisonRevenue: Math.round(cargaisonRevenueTotal),
        moduleRevenue,
        garageCommission: Math.round(payroll.reduce((s, p) => s + p.garageCommission, 0)),
        taxiCommission: Math.round(payroll.reduce((s, p) => s + p.taxiCommission, 0)),
        pawnshopCommission: Math.round(payroll.reduce((s, p) => s + p.pawnshopCommission, 0)),
        chasseCommission: Math.round(payroll.reduce((s, p) => s + p.chasseCommission, 0)),
        runsCommission: Math.round(payroll.reduce((s, p) => s + p.runsCommission, 0)),
        concessionCommission: Math.round(payroll.reduce((s, p) => s + p.concessionCommission, 0)),
        cargaisonShare: Math.round(payroll.reduce((s, p) => s + p.cargaisonShare, 0)),
        peakBonus: Math.round(payroll.reduce((s, p) => s + p.peakBonus, 0)),
        peakEnabled,
        peakMultiplier,
        weeklyHoursCap,
        caGross,
        salesDiscount,
        caNet,
        totalRevenue: caNet,
        productionCost,
        grossMargin,
        componentPurchases,
        salesCount,
        expensesTotal,
        expensesDeductible,
        payrollTotal,
        excessToCompany,
        charges,
        benefit,
        taxableBenefit,
        effectiveRate,
        dividends: effectiveDividends,
        corporateTax: taxes.corporateTax,
        dividendTax: taxes.dividendTax,
        dividendTaxRate: taxes.dividendTaxRate,
        totalTax: taxes.totalTax,
        netAfterTax,
      },
      expensesByCategory,
      payroll,
      salesByDay: byDay,
      salesByPayment: payRowsAgg.map((r) => ({ method: r.method, total: round2(Number(r.total)), count: Number(r.count) })),
      perfByEmployee: perfRows.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        salesCount: Number(r.count) + (garageCountByEmp.get(r.employeeId) ?? 0) + (concessionCountByEmp.get(r.employeeId) ?? 0) + (taxiCountByEmp.get(r.employeeId) ?? 0) + (pawnshopCountByEmp.get(r.employeeId) ?? 0) + (chasseCountByEmp.get(r.employeeId) ?? 0) + (runsCountByEmp.get(r.employeeId) ?? 0) + (cargaisonCountByEmp.get(r.employeeId) ?? 0),
        ca: round2(Number(r.ca) + (garageRevByEmp.get(r.employeeId) ?? 0) + (concessionMarginByEmp.get(r.employeeId) ?? 0) + (taxiRevByEmp.get(r.employeeId) ?? 0) + (pawnshopRevByEmp.get(r.employeeId) ?? 0) + (chasseRevByEmp.get(r.employeeId) ?? 0) + (runsRevByEmp.get(r.employeeId) ?? 0) + (cargaisonShareByEmp.get(r.employeeId) ?? 0)),
        discounts: round2(Number(r.discounts)),
      })).sort((a, b) => b.ca - a.ca),
      topProducts: topRows.map((r) => {
        const ca = round2(Number(r.ca));
        const cost = round2(Number(r.cost));
        return { name: r.name, qty: round2(Number(r.qty)), ca, cost, margin: round2(ca - cost) };
      }),
      salesList: listRows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        total: Number(r.total),
        paymentMethod: r.paymentMethod,
        employeeName: r.employeeName,
        clientName: r.clientName,
      })),
    };

    return { exRow: exRows[0], detailBase };
}

export async function snapshotExerciceIfClosed(companyId: number, id: number) {
  const built = await buildExerciceDetail(companyId, id);
  if (!built || built.exRow.status !== 'closed') return;
  await db
    .update(exercices)
    .set({ snapshot: built.detailBase })
    .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)));
}

meExercicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const built = await buildExerciceDetail(companyId, id);
    if (!built) return res.status(404).json({ error: 'not_found' });
    const { exRow, detailBase } = built;

    const stocksAcc = await getModuleAccess(req.user!.id, companyId, 'stocks');
    const stocksEnabled = !!stocksAcc && stocksAcc.enabled && !stocksAcc.blocked && stocksAcc.canView;

    let base: typeof detailBase = detailBase;
    let frozen = false;
    if (exRow.status === 'closed') {
      frozen = true;
      const rawSnap = exRow.snapshot;
      const snap = (
        rawSnap == null ? null : typeof rawSnap === 'string' ? JSON.parse(rawSnap) : rawSnap
      ) as typeof detailBase | null;
      if (snap) {
        base = snap;
      } else {
        await db
          .update(exercices)
          .set({ snapshot: detailBase })
          .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)));
      }
    }

    res.json({
      ...base,
      canWrite: g.canWrite,
      canEdit: g.canEdit,
      payrollVisible: true,
      stocksEnabled,
      payroll: base.payroll ?? [],
      frozen,
    });
  }),
);

const payrollMoney = z.number().nonnegative().finite().max(9_999_999_999.99);
const payrollSchema = z.object({
  bonus: payrollMoney,
  deductions: payrollMoney,
  notes: z.string().trim().max(200).nullish().or(z.literal('')),
});

meExercicesRouter.put(
  '/:id/payroll/:employeeId',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    const employeeId = parseId(req.params.employeeId);
    if (!companyId || !id || !employeeId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = payrollSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const exRow = await db
      .select({ id: exercices.id, status: exercices.status })
      .from(exercices)
      .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)))
      .limit(1);
    if (!exRow[0]) return res.status(404).json({ error: 'not_found' });
    if (exRow[0].status === 'closed') return res.status(409).json({ error: 'exercice_closed' });
    const empRow = await db
      .select({ id: companyEmployees.id })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.id, employeeId), eq(companyEmployees.companyId, companyId)))
      .limit(1);
    if (!empRow[0]) return res.status(404).json({ error: 'not_found' });
    const amounts = {
      commission: '0',
      bonus: String(Math.round(parsed.data.bonus)),
      deductions: String(Math.round(parsed.data.deductions)),
    };
    const setOnUpdate: Record<string, unknown> = { ...amounts };
    if (parsed.data.notes !== undefined) setOnUpdate.notes = blank(parsed.data.notes);
    await db
      .insert(exercicePayroll)
      .values({ companyId, exerciceId: id, employeeId, ...amounts, notes: blank(parsed.data.notes) })
      .onDuplicateKeyUpdate({ set: setOnUpdate });
    emitInvalidate(['irs', `company:${companyId}`], [['exercice', companyId, id]]);
    res.json({ ok: true });
  }),
);

const paidSchema = z.object({ paid: z.boolean() });
meExercicesRouter.put(
  '/:id/payroll/:employeeId/paid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    const employeeId = parseId(req.params.employeeId);
    if (!companyId || !id || !employeeId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = paidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const exRow = await db.select({ id: exercices.id, status: exercices.status }).from(exercices).where(and(eq(exercices.id, id), eq(exercices.companyId, companyId))).limit(1);
    if (!exRow[0]) return res.status(404).json({ error: 'not_found' });
    if (exRow[0].status === 'closed') return res.status(409).json({ error: 'exercice_closed' });
    const empRow = await db.select({ id: companyEmployees.id }).from(companyEmployees).where(and(eq(companyEmployees.id, employeeId), eq(companyEmployees.companyId, companyId))).limit(1);
    if (!empRow[0]) return res.status(404).json({ error: 'not_found' });
    const paidAt = parsed.data.paid ? sql`CURRENT_TIMESTAMP` : null;
    await db
      .insert(exercicePayroll)
      .values({ companyId, exerciceId: id, employeeId, paid: parsed.data.paid, paidAt })
      .onDuplicateKeyUpdate({ set: { paid: parsed.data.paid, paidAt } });
    emitInvalidate(['irs', `company:${companyId}`], [['exercice', companyId, id]]);
    res.json({ ok: true });
  }),
);
