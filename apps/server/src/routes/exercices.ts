import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { moduleConfigBool } from '@rp-compta/shared';
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
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { computeTaxes } from '../services/declarations';
import { emitInvalidate } from '../realtime/socket';

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
    (d) => (Date.parse(`${d.endDate}T00:00:00Z`) - Date.parse(`${d.startDate}T00:00:00Z`)) / 86_400_000 <= 400,
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

    const now = new Date();
    now.setUTCDate(now.getUTCDate() + offset * 7);
    const day = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const startStr = monday.toISOString().slice(0, 10);
    const endStr = sunday.toISOString().slice(0, 10);
    const label = `Semaine du ${monday.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au ${sunday.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`;

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
    emitInvalidate(['irs', `company:${companyId}`], [['exercices', companyId]]);
    res.json({ ok: true });
  }),
);

meExercicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const exRows = await db
      .select()
      .from(exercices)
      .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)))
      .limit(1);
    if (!exRows[0]) return res.status(404).json({ error: 'not_found' });
    const ex = serialize(exRows[0]);

    const cmRows = await db
      .select({ config: companyModules.config })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'exercices')))
      .limit(1);
    const dividendsEnabled = moduleConfigBool(
      cmRows[0]?.config as Record<string, unknown> | null,
      'exercices',
      'dividends',
    );
    const effectiveDividends = dividendsEnabled ? ex.dividends : 0;

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
        position: companyEmployees.position,
        hourlyRate: companyEmployees.hourlyRate,
        workedMin: sql<string>`COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(MINUTE, ${timeEntries.clockIn}, ${timeEntries.clockOut}) - ${timeEntries.pauseMinutes})), 0)`,
      })
      .from(timeEntries)
      .innerJoin(companyEmployees, eq(timeEntries.employeeId, companyEmployees.id))
      .where(
        and(
          eq(timeEntries.companyId, companyId),
          isNotNull(timeEntries.clockOut),
          gte(sql`DATE(${timeEntries.clockIn})`, ex.startDate),
          lte(sql`DATE(${timeEntries.clockIn})`, ex.endDate),
        ),
      )
      .groupBy(companyEmployees.id);

    const payroll = payRows.map((r) => {
      const rawHours = Number(r.workedMin) / 60;
      const hours = round2(rawHours);
      const cappedHours = ex.hoursCap > 0 ? Math.min(rawHours, ex.hoursCap) : rawHours;
      const rate = Number(r.hourlyRate);
      const base = round2(cappedHours * rate);
      const o = overrides.get(r.employeeId);
      const commission = o ? Number(o.commission) : 0;
      const bonus = o ? Number(o.bonus) : 0;
      const deductions = o ? Number(o.deductions) : 0;
      const theoretical = round2(Math.max(0, base + commission + bonus - deductions));
      const paid = ex.salaryCap > 0 ? Math.min(theoretical, ex.salaryCap) : theoretical;
      return {
        employeeId: r.employeeId,
        name: r.name,
        position: r.position,
        hours,
        cappedHours: round2(cappedHours),
        hourlyRate: rate,
        base,
        commission,
        bonus,
        deductions,
        theoretical,
        paid: round2(paid),
        excess: round2(Math.max(0, theoretical - paid)),
        notes: o?.notes ?? null,
      };
    });
    const payrollTotal = round2(payroll.reduce((s, p) => s + p.paid, 0));
    const excessToCompany = round2(payroll.reduce((s, p) => s + p.excess, 0));

    const badgeuseAcc = await getModuleAccess(req.user!.id, companyId, 'badgeuse');
    const payrollVisible =
      !!badgeuseAcc && badgeuseAcc.enabled && !badgeuseAcc.blocked && badgeuseAcc.canView;

    const salesWhere = and(
      eq(sales.companyId, companyId),
      gte(sql`DATE(${sales.createdAt})`, ex.startDate),
      lte(sql`DATE(${sales.createdAt})`, ex.endDate),
    );
    const itemsWhere = and(
      eq(saleItems.companyId, companyId),
      gte(sql`DATE(${sales.createdAt})`, ex.startDate),
      lte(sql`DATE(${sales.createdAt})`, ex.endDate),
    );
    const dayExpr = sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`;

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
            gte(sql`DATE(${stockMovements.createdAt})`, ex.startDate),
            lte(sql`DATE(${stockMovements.createdAt})`, ex.endDate),
          ),
        ),
    ]);

    const salesGross = round2(Number(aggRows[0]?.gross ?? 0));
    const salesDiscount = round2(Number(aggRows[0]?.discount ?? 0));
    const salesNet = round2(Number(aggRows[0]?.net ?? 0));
    const productionCost = round2(Number(aggRows[0]?.cost ?? 0));
    const salesCount = Number(aggRows[0]?.count ?? 0);
    const componentPurchases = round2(Number(purchRows[0]?.purchases ?? 0));

    const caGross = round2(salesGross + ex.revenue);
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
      byDay.push({ date: d, total: round2(dayMap.get(d) ?? 0) });
    }

    const detailBase = {
      ...ex,
      summary: {
        revenue: ex.revenue,
        salesRevenue: salesNet,
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
        salesCount: Number(r.count),
        ca: round2(Number(r.ca)),
        discounts: round2(Number(r.discounts)),
      })),
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

    // A closed exercice is FROZEN: snapshot the figures on first read, then always serve that snapshot.
    let base: typeof detailBase = detailBase;
    let frozen = false;
    if (ex.status === 'closed') {
      frozen = true;
      const snap = exRows[0].snapshot as typeof detailBase | null;
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
      payrollVisible,
      payroll: payrollVisible ? (base.payroll ?? []) : [],
      frozen,
    });
  }),
);

const payrollMoney = z.number().nonnegative().finite().max(9_999_999_999.99);
const payrollSchema = z.object({
  commission: payrollMoney,
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
    const badgeuseAcc = await getModuleAccess(req.user!.id, companyId, 'badgeuse');
    if (!badgeuseAcc || !badgeuseAcc.enabled || badgeuseAcc.blocked || !badgeuseAcc.canView) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const parsed = payrollSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const exRow = await db
      .select({ id: exercices.id })
      .from(exercices)
      .where(and(eq(exercices.id, id), eq(exercices.companyId, companyId)))
      .limit(1);
    if (!exRow[0]) return res.status(404).json({ error: 'not_found' });
    const empRow = await db
      .select({ id: companyEmployees.id })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.id, employeeId), eq(companyEmployees.companyId, companyId)))
      .limit(1);
    if (!empRow[0]) return res.status(404).json({ error: 'not_found' });
    const amounts = {
      commission: String(round2(parsed.data.commission)),
      bonus: String(round2(parsed.data.bonus)),
      deductions: String(round2(parsed.data.deductions)),
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
