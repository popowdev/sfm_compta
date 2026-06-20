import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { moduleConfigBool } from '@rp-compta/shared';
import { db } from '../db';
import {
  exercices,
  companyExpenses,
  companyEmployees,
  timeEntries,
  companyModules,
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
  return { ok: true as const, canWrite: acc.canWrite };
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
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

const money = z.number().nonnegative().finite().max(99_999_999_999.99);

const createSchema = z
  .object({
    label: z.string().trim().min(1).max(150),
    startDate: z.string().refine(isDate, 'invalid_date'),
    endDate: z.string().refine(isDate, 'invalid_date'),
    revenue: money.optional(),
    dividends: money.optional(),
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
    if (d.status !== undefined) set.status = d.status;
    if (d.revenue !== undefined) set.revenue = String(round2(d.revenue));
    if (d.dividends !== undefined) set.dividends = String(round2(d.dividends));
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

    const expRows = await db
      .select({
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
      );
    const expensesTotal = Number(expRows[0]?.total ?? 0);
    const expensesDeductible = Number(expRows[0]?.deductible ?? 0);

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
      const workedMin = Number(r.workedMin);
      const rate = Number(r.hourlyRate);
      return {
        employeeId: r.employeeId,
        name: r.name,
        position: r.position,
        hours: round2(workedMin / 60),
        hourlyRate: rate,
        salary: round2((workedMin / 60) * rate),
      };
    });
    const payrollTotal = round2(payroll.reduce((s, p) => s + p.salary, 0));

    const badgeuseAcc = await getModuleAccess(req.user!.id, companyId, 'badgeuse');
    const payrollVisible =
      !!badgeuseAcc && badgeuseAcc.enabled && !badgeuseAcc.blocked && badgeuseAcc.canView;

    const charges = round2(expensesTotal + payrollTotal);
    const benefit = round2(ex.revenue - charges);
    const taxes = await computeTaxes(benefit, effectiveDividends);
    const netAfterTax = round2(
      benefit - taxes.corporateTax - effectiveDividends - taxes.dividendTax,
    );

    res.json({
      ...ex,
      canWrite: g.canWrite,
      payrollVisible,
      summary: {
        revenue: ex.revenue,
        expensesTotal,
        expensesDeductible,
        payrollTotal,
        charges,
        benefit,
        dividends: effectiveDividends,
        corporateTax: taxes.corporateTax,
        dividendTax: taxes.dividendTax,
        dividendTaxRate: taxes.dividendTaxRate,
        totalTax: taxes.totalTax,
        netAfterTax,
      },
      payroll: payrollVisible ? payroll : [],
    });
  }),
);
