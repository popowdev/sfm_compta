import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { declarations, companyExpenses, subventions, companyEmployees } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const num = (v: string | null) => (v === null ? 0 : Number(v));

export const meStatsRouter = Router({ mergeParams: true });
meStatsRouter.use(requireAuth);

meStatsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'stats');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });

    const [decls, exps, subs, emps] = await Promise.all([
      db.select().from(declarations).where(eq(declarations.companyId, companyId)).orderBy(asc(declarations.createdAt)),
      db.select().from(companyExpenses).where(eq(companyExpenses.companyId, companyId)),
      db.select().from(subventions).where(eq(subventions.companyId, companyId)),
      db.select().from(companyEmployees).where(eq(companyEmployees.companyId, companyId)),
    ]);

    const activeDecls = decls.filter((d) => d.status !== 'cancelled');
    const fiscal = {
      caNet: activeDecls.reduce((s, d) => s + num(d.caNet), 0),
      benefit: activeDecls.reduce((s, d) => s + num(d.benefit), 0),
      totalTax: activeDecls.reduce((s, d) => s + num(d.totalTax), 0),
      dividends: activeDecls.reduce((s, d) => s + num(d.dividends), 0),
      count: activeDecls.length,
      weekly: activeDecls.slice(-12).map((d) => ({
        weekLabel: d.weekLabel,
        caNet: num(d.caNet),
        benefit: num(d.benefit),
        totalTax: num(d.totalTax),
      })),
    };

    const byCategory: Record<string, number> = {};
    for (const e of exps) byCategory[e.category] = (byCategory[e.category] ?? 0) + num(e.amount);
    const expensesStat = {
      total: exps.reduce((s, e) => s + num(e.amount), 0),
      deductible: exps.filter((e) => e.taxDeductible).reduce((s, e) => s + num(e.amount), 0),
      count: exps.length,
      byCategory: Object.entries(byCategory).map(([category, total]) => ({ category, total })),
    };

    const decided = subs.filter((s) => s.status === 'approved' || s.status === 'paid');
    const subventionsStat = {
      requested: subs.reduce((s, x) => s + num(x.amountRequested), 0),
      granted: decided.reduce((s, x) => s + num(x.amountGranted), 0),
      count: subs.length,
      pending: subs.filter((s) => s.status === 'pending').length,
    };

    const byPosition: Record<string, number> = {};
    for (const e of emps) if (e.active) byPosition[e.position] = (byPosition[e.position] ?? 0) + 1;
    const hrStat = {
      count: emps.length,
      active: emps.filter((e) => e.active).length,
      hourlyTotal: emps.filter((e) => e.active).reduce((s, e) => s + num(e.hourlyRate), 0),
      byPosition: Object.entries(byPosition).map(([position, count]) => ({ position, count })),
    };

    res.json({ fiscal, expenses: expensesStat, subventions: subventionsStat, hr: hrStat });
  }),
);
