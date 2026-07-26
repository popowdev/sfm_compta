import { Router } from 'express';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  sales,
  garageRepairs,
  garageCustoms,
  saleItems,
  stockItems,
  companyEmployees,
  companyClients,
  memberships,
  exercices,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import type { ModuleKey } from '@rp-compta/shared';
import { getModuleAccess, isStaff } from '../services/access';

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

    const can = async (key: ModuleKey) => {
      if (staff) return true;
      const acc = await getModuleAccess(req.user!.id, companyId, key);
      return !!acc && acc.enabled && !acc.blocked && acc.canView;
    };
    const [seeCaisse, seeStocks, seeRh, seeClients, seeExercices] = await Promise.all([
      can('caisse'),
      can('stocks'),
      can('rh'),
      can('clients'),
      can('exercices'),
    ]);

    const since = new Date(Date.now() - 29 * 86_400_000);
    const sinceStr = since.toISOString().slice(0, 10);
    const dayExpr = sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`;

    const [salesAgg, dayRows, topRows, stockRows, lowRows, empRow, clientRow, openEx, garageRepDays, garageCustDays] = await Promise.all([
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
      db
        .select({ date: sql<string>`DATE_FORMAT(${garageRepairs.createdAt}, '%Y-%m-%d')`, total: sql<string>`COALESCE(SUM(${garageRepairs.total}), 0)` })
        .from(garageRepairs)
        .where(and(eq(garageRepairs.companyId, companyId), gte(sql`DATE_FORMAT(${garageRepairs.createdAt}, '%Y-%m-%d')`, sinceStr)))
        .groupBy(sql`DATE_FORMAT(${garageRepairs.createdAt}, '%Y-%m-%d')`),
      db
        .select({ date: sql<string>`DATE_FORMAT(${garageCustoms.createdAt}, '%Y-%m-%d')`, total: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}), 0)` })
        .from(garageCustoms)
        .where(and(eq(garageCustoms.companyId, companyId), gte(sql`DATE_FORMAT(${garageCustoms.createdAt}, '%Y-%m-%d')`, sinceStr)))
        .groupBy(sql`DATE_FORMAT(${garageCustoms.createdAt}, '%Y-%m-%d')`),
    ]);

    const [garageCostRep, garageCostCust] = await Promise.all([
      db
        .select({ c: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}), 0)` })
        .from(garageRepairs)
        .where(and(eq(garageRepairs.companyId, companyId), gte(sql`DATE_FORMAT(${garageRepairs.createdAt}, '%Y-%m-%d')`, sinceStr))),
      db
        .select({ c: sql<string>`COALESCE(SUM(${garageCustoms.commissionAmount} + ${garageCustoms.costPrice}), 0)` })
        .from(garageCustoms)
        .where(and(eq(garageCustoms.companyId, companyId), gte(sql`DATE_FORMAT(${garageCustoms.createdAt}, '%Y-%m-%d')`, sinceStr))),
    ]);
    const garageCost = Number(garageCostRep[0]?.c ?? 0) + Number(garageCostCust[0]?.c ?? 0);

    const dayMap = new Map(dayRows.map((r) => [r.date, Number(r.total)]));
    const slots: string[] = [];
    for (let i = 0; i < 30; i += 1) slots.push(new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10));
    const slotSet = new Set(slots);
    let garageTotal = 0;
    for (const r of [...garageRepDays, ...garageCustDays]) {
      if (!slotSet.has(r.date)) continue;
      const v = Number(r.total);
      garageTotal += v;
      dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + v);
    }
    const byDay: { date: string; total: number }[] = slots.map((d) => ({ date: d, total: round2(dayMap.get(d) ?? 0) }));
    const salesTotal = Number(salesAgg[0]?.total ?? 0) + garageTotal;
    const salesCost = Number(salesAgg[0]?.cost ?? 0) + garageCost;

    res.json({
      sales: seeCaisse
        ? {
            total: round2(salesTotal),
            count: Number(salesAgg[0]?.count ?? 0),
            margin: round2(salesTotal - salesCost),
            byDay,
            topProducts: topRows.map((r) => ({ name: r.name, revenue: round2(Number(r.revenue)) })),
          }
        : { total: 0, count: 0, margin: 0, byDay: [], topProducts: [] },
      stock: seeStocks
        ? {
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
          }
        : { totalValue: 0, itemCount: 0, lowCount: 0, lowItems: [] },
      hr: seeRh
        ? { total: Number(empRow[0]?.total ?? 0), active: Number(empRow[0]?.active ?? 0) }
        : { total: 0, active: 0 },
      clients: seeClients
        ? { count: Number(clientRow[0]?.count ?? 0), debt: round2(Number(clientRow[0]?.debt ?? 0)) }
        : { count: 0, debt: 0 },
      openExercices: seeExercices ? Number(openEx[0]?.count ?? 0) : 0,
    });
  }),
);
