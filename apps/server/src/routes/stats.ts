import { Router } from 'express';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  declarations,
  companyExpenses,
  subventions,
  companyEmployees,
  companyRoles,
  sales,
  saleItems,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import type { ModuleKey } from '@rp-compta/shared';
import { getModuleAccess } from '../services/access';
import { bizDayStr, bizToday, bizDayList } from '../services/bizTime';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const num = (v: string | null) => (v === null ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

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

    const canView = async (key: ModuleKey) => {
      const a = await getModuleAccess(req.user!.id, companyId, key);
      return !!a && a.enabled && !a.blocked && a.canView;
    };
    const [seeCaisse, seeDepenses, seeSubventions, seeRh, seeDecl] = await Promise.all([
      canView('caisse'),
      canView('depenses'),
      canView('subventions'),
      canView('rh'),
      canView('declarations'),
    ]);

    const slots = bizDayList(30);
    const sinceStr = slots[0] ?? bizToday();
    const dayExpr = bizDayStr(sales.createdAt);

    const [decls, exps, subs, emps, salesAgg, dayRows, empRows, topRows, payRows] = await Promise.all([
      db.select().from(declarations).where(and(eq(declarations.companyId, companyId), isNull(declarations.archivedAt))).orderBy(asc(declarations.createdAt)),
      db.select().from(companyExpenses).where(eq(companyExpenses.companyId, companyId)),
      db.select().from(subventions).where(eq(subventions.companyId, companyId)),
      db.select().from(companyEmployees).where(eq(companyEmployees.companyId, companyId)),
      db
        .select({
          total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
          cost: sql<string>`COALESCE(SUM(${sales.productionCost}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .where(eq(sales.companyId, companyId)),
      db
        .select({ date: dayExpr, total: sql<string>`COALESCE(SUM(${sales.total}), 0)` })
        .from(sales)
        .where(and(eq(sales.companyId, companyId), gte(dayExpr, sinceStr)))
        .groupBy(dayExpr),
      db
        .select({
          name: companyEmployees.name,
          total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .leftJoin(companyEmployees, eq(sales.employeeId, companyEmployees.id))
        .where(eq(sales.companyId, companyId))
        .groupBy(sales.employeeId, companyEmployees.name)
        .orderBy(desc(sql`SUM(${sales.total})`))
        .limit(10),
      db
        .select({
          name: saleItems.name,
          qty: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
          revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
        })
        .from(saleItems)
        .where(eq(saleItems.companyId, companyId))
        .groupBy(saleItems.name)
        .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
        .limit(10),
      db
        .select({
          method: sales.paymentMethod,
          total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .where(eq(sales.companyId, companyId))
        .groupBy(sales.paymentMethod),
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
      byCategory: Object.entries(byCategory).map(([category, total]) => ({ category, total: round2(total) })),
    };

    const decided = subs.filter((s) => s.status === 'approved' || s.status === 'paid');
    const subventionsStat = {
      requested: subs.reduce((s, x) => s + num(x.amountRequested), 0),
      granted: decided.reduce((s, x) => s + num(x.amountGranted), 0),
      count: subs.length,
      pending: subs.filter((s) => s.status === 'pending').length,
    };

    const gradeCounts = await db
      .select({ name: companyRoles.name, count: sql<number>`COUNT(*)` })
      .from(companyEmployees)
      .leftJoin(companyRoles, eq(companyEmployees.companyRoleId, companyRoles.id))
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)))
      .groupBy(companyRoles.name);
    const hrStat = {
      count: emps.length,
      active: emps.filter((e) => e.active).length,
      hourlyTotal: emps.filter((e) => e.active).reduce((s, e) => s + num(e.hourlyRate), 0),
      byPosition: gradeCounts.map((r) => ({ position: r.name ?? 'Sans grade', count: Number(r.count) })),
    };

    const dayMap = new Map(dayRows.map((r) => [r.date, Number(r.total)]));
    const series: { date: string; total: number }[] = slots.map((d) => ({ date: d, total: round2(dayMap.get(d) ?? 0) }));
    const salesTotal = num(salesAgg[0]?.total ?? null);
    const salesCost = num(salesAgg[0]?.cost ?? null);
    const salesStat = {
      total: round2(salesTotal),
      count: Number(salesAgg[0]?.count ?? 0),
      margin: round2(salesTotal - salesCost),
      byDay: series,
      byEmployee: empRows.map((r) => ({
        name: r.name ?? 'Inconnu',
        total: round2(Number(r.total)),
        count: Number(r.count),
      })),
      topProducts: topRows.map((r) => ({
        name: r.name,
        qty: round2(Number(r.qty)),
        revenue: round2(Number(r.revenue)),
      })),
      byPayment: payRows.map((r) => ({
        method: r.method,
        total: round2(Number(r.total)),
        count: Number(r.count),
      })),
    };

    res.json({
      fiscal: seeDecl ? fiscal : { caNet: 0, benefit: 0, totalTax: 0, dividends: 0, count: 0, weekly: [] },
      expenses: seeDepenses ? expensesStat : { total: 0, deductible: 0, count: 0, byCategory: [] },
      subventions: seeSubventions ? subventionsStat : { requested: 0, granted: 0, count: 0, pending: 0 },
      hr: seeRh ? hrStat : { count: 0, active: 0, hourlyTotal: 0, byPosition: [] },
      sales: seeCaisse
        ? salesStat
        : { total: 0, count: 0, margin: 0, byDay: [], byEmployee: [], topProducts: [], byPayment: [] },
    });
  }),
);
