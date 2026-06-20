import { Router } from 'express';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  sales,
  saleItems,
  stockItems,
  companyEmployees,
  companyClients,
  memberships,
  exercices,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { isStaff } from '../services/access';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export const meDashboardRouter = Router({ mergeParams: true });
meDashboardRouter.use(requireAuth);

meDashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });

    const staff = await isStaff(req.user!.id);
    if (!staff) {
      const mem = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.companyId, companyId),
            eq(memberships.userId, req.user!.id),
            eq(memberships.active, true),
          ),
        )
        .limit(1);
      if (!mem[0]) return res.status(403).json({ error: 'forbidden' });
    }

    const since = new Date(Date.now() - 29 * 86_400_000);
    const sinceStr = since.toISOString().slice(0, 10);
    const dayExpr = sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`;

    const [salesAgg, dayRows, topRows, stockRows, lowRows, empRow, clientRow, openEx] = await Promise.all([
      db
        .select({
          total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
          cost: sql<string>`COALESCE(SUM(${sales.productionCost}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .where(and(eq(sales.companyId, companyId), gte(dayExpr, sinceStr))),
      db
        .select({ date: dayExpr, total: sql<string>`COALESCE(SUM(${sales.total}), 0)` })
        .from(sales)
        .where(and(eq(sales.companyId, companyId), gte(dayExpr, sinceStr)))
        .groupBy(dayExpr),
      db
        .select({ name: saleItems.name, revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)` })
        .from(saleItems)
        .innerJoin(sales, eq(saleItems.saleId, sales.id))
        .where(and(eq(sales.companyId, companyId), gte(dayExpr, sinceStr)))
        .groupBy(saleItems.name)
        .orderBy(desc(sql`SUM(${saleItems.lineTotal})`))
        .limit(5),
      db
        .select({
          value: sql<string>`COALESCE(SUM(${stockItems.quantity} * ${stockItems.unitCost}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(stockItems)
        .where(eq(stockItems.companyId, companyId)),
      db
        .select({
          id: stockItems.id,
          name: stockItems.name,
          quantity: stockItems.quantity,
          unit: stockItems.unit,
          threshold: stockItems.lowStockThreshold,
        })
        .from(stockItems)
        .where(
          and(
            eq(stockItems.companyId, companyId),
            sql`${stockItems.lowStockThreshold} > 0`,
            sql`${stockItems.quantity} <= ${stockItems.lowStockThreshold}`,
          ),
        )
        .orderBy(asc(stockItems.quantity))
        .limit(8),
      db
        .select({
          total: sql<number>`COUNT(*)`,
          active: sql<number>`COALESCE(SUM(CASE WHEN ${companyEmployees.active} THEN 1 ELSE 0 END), 0)`,
        })
        .from(companyEmployees)
        .where(eq(companyEmployees.companyId, companyId)),
      db
        .select({
          count: sql<number>`COUNT(*)`,
          debt: sql<string>`COALESCE(SUM(CASE WHEN ${companyClients.accountBalance} < 0 THEN -${companyClients.accountBalance} ELSE 0 END), 0)`,
        })
        .from(companyClients)
        .where(eq(companyClients.companyId, companyId)),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(exercices)
        .where(and(eq(exercices.companyId, companyId), eq(exercices.status, 'open'))),
    ]);

    const dayMap = new Map(dayRows.map((r) => [r.date, Number(r.total)]));
    const byDay: { date: string; total: number }[] = [];
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      byDay.push({ date: d, total: round2(dayMap.get(d) ?? 0) });
    }
    const salesTotal = Number(salesAgg[0]?.total ?? 0);
    const salesCost = Number(salesAgg[0]?.cost ?? 0);

    res.json({
      sales: {
        total: round2(salesTotal),
        count: Number(salesAgg[0]?.count ?? 0),
        margin: round2(salesTotal - salesCost),
        byDay,
        topProducts: topRows.map((r) => ({ name: r.name, revenue: round2(Number(r.revenue)) })),
      },
      stock: {
        totalValue: round2(Number(stockRows[0]?.value ?? 0)),
        itemCount: Number(stockRows[0]?.count ?? 0),
        lowCount: lowRows.length,
        lowItems: lowRows.map((r) => ({
          id: r.id,
          name: r.name,
          quantity: Number(r.quantity),
          unit: r.unit,
          threshold: Number(r.threshold),
        })),
      },
      hr: { total: Number(empRow[0]?.total ?? 0), active: Number(empRow[0]?.active ?? 0) },
      clients: { count: Number(clientRow[0]?.count ?? 0), debt: round2(Number(clientRow[0]?.debt ?? 0)) },
      openExercices: Number(openEx[0]?.count ?? 0),
    });
  }),
);
