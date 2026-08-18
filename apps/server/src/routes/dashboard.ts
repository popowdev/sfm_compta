import { Router } from 'express';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
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
  taxiCitoyens,
  taxiConcitoyens,
  taxiVip,
  pawnshopTransactions,
  chasseTransactions,
  companyRuns,
  concessionSales,
  companyCargaisons,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { bizDayStr, bizToday, bizDayList } from '../services/bizTime';
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
    const [
      seeCaisse, seeStocks, seeRh, seeClients, seeExercices,
      seeGarage, seeTaxi, seePawnshop, seeChasse, seeRuns, seeConcession, seeCargaison,
    ] = await Promise.all([
      can('caisse'), can('stocks'), can('rh'), can('clients'), can('exercices'),
      can('garage'), can('taxi'), can('pawnshop'), can('chasse'), can('runs'), can('concession'), can('cargaison'),
    ]);
    const seeAnyRevenue = seeCaisse || seeGarage || seeTaxi || seePawnshop || seeChasse || seeRuns || seeConcession || seeCargaison;

    const slots = bizDayList(7);
    const sinceStr = slots[0] ?? bizToday();
    const dayExpr = bizDayStr(sales.createdAt);

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
        .select({ date: bizDayStr(garageRepairs.createdAt), total: sql<string>`COALESCE(SUM(${garageRepairs.total}), 0)` })
        .from(garageRepairs)
        .where(and(eq(garageRepairs.companyId, companyId), gte(bizDayStr(garageRepairs.createdAt), sinceStr)))
        .groupBy(bizDayStr(garageRepairs.createdAt)),
      db
        .select({ date: bizDayStr(garageCustoms.createdAt), total: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}), 0)` })
        .from(garageCustoms)
        .where(and(eq(garageCustoms.companyId, companyId), gte(bizDayStr(garageCustoms.createdAt), sinceStr)))
        .groupBy(bizDayStr(garageCustoms.createdAt)),
    ]);

    const [garageCostRep, garageCostCust] = await Promise.all([
      db
        .select({ c: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}), 0)` })
        .from(garageRepairs)
        .where(and(eq(garageRepairs.companyId, companyId), gte(bizDayStr(garageRepairs.createdAt), sinceStr))),
      db
        .select({ c: sql<string>`COALESCE(SUM(${garageCustoms.commissionAmount} + ${garageCustoms.costPrice}), 0)` })
        .from(garageCustoms)
        .where(and(eq(garageCustoms.companyId, companyId), gte(bizDayStr(garageCustoms.createdAt), sinceStr))),
    ]);
    const garageCost = Number(garageCostRep[0]?.c ?? 0) + Number(garageCostCust[0]?.c ?? 0);

    const dTaxiCit = bizDayStr(taxiCitoyens.createdAt);
    const dTaxiCo = bizDayStr(taxiConcitoyens.createdAt);
    const dTaxiVip = bizDayStr(taxiVip.createdAt);
    const dPawn = bizDayStr(pawnshopTransactions.createdAt);
    const dChasse = bizDayStr(chasseTransactions.createdAt);
    const dRuns = bizDayStr(companyRuns.createdAt);
    const dConc = bizDayStr(concessionSales.createdAt);
    const dCarg = bizDayStr(companyCargaisons.createdAt);

    const [
      taxiCitDays, taxiCoDays, taxiVipDays, pawnSellDays, chasseSellDays, runsDays, concDays, cargDays,
      concCostRow, chasseBuyRow, pawnBuyRow,
    ] = await Promise.all([
      db.select({ date: dTaxiCit, total: sql<string>`COALESCE(SUM(${taxiCitoyens.total}),0)` }).from(taxiCitoyens).where(and(eq(taxiCitoyens.companyId, companyId), gte(dTaxiCit, sinceStr))).groupBy(dTaxiCit),
      db.select({ date: dTaxiCo, total: sql<string>`COALESCE(SUM(${taxiConcitoyens.total}),0)` }).from(taxiConcitoyens).where(and(eq(taxiConcitoyens.companyId, companyId), gte(dTaxiCo, sinceStr))).groupBy(dTaxiCo),
      db.select({ date: dTaxiVip, total: sql<string>`COALESCE(SUM(${taxiVip.total}),0)` }).from(taxiVip).where(and(eq(taxiVip.companyId, companyId), gte(dTaxiVip, sinceStr))).groupBy(dTaxiVip),
      db.select({ date: dPawn, total: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.type, 'sell'), gte(dPawn, sinceStr))).groupBy(dPawn),
      db.select({ date: dChasse, total: sql<string>`COALESCE(SUM(${chasseTransactions.total}),0)` }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.type, 'sell'), gte(dChasse, sinceStr))).groupBy(dChasse),
      db.select({ date: dRuns, total: sql<string>`COALESCE(SUM(${companyRuns.total}),0)` }).from(companyRuns).where(and(eq(companyRuns.companyId, companyId), gte(dRuns, sinceStr))).groupBy(dRuns),
      db.select({ date: dConc, total: sql<string>`COALESCE(SUM(${concessionSales.salePrice}),0)` }).from(concessionSales).where(and(eq(concessionSales.companyId, companyId), gte(dConc, sinceStr))).groupBy(dConc),
      db.select({ date: dCarg, total: sql<string>`COALESCE(SUM(${companyCargaisons.total}),0)` }).from(companyCargaisons).where(and(eq(companyCargaisons.companyId, companyId), gte(dCarg, sinceStr))).groupBy(dCarg),
      db.select({ c: sql<string>`COALESCE(SUM(${concessionSales.purchasePrice}),0)` }).from(concessionSales).where(and(eq(concessionSales.companyId, companyId), gte(dConc, sinceStr))),
      db.select({ c: sql<string>`COALESCE(SUM(${chasseTransactions.total}),0)` }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.type, 'buy'), gte(dChasse, sinceStr))),
      db.select({ c: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.type, 'buy'), gte(dPawn, sinceStr))),
    ]);

    const slotSet = new Set(slots);
    const dayMap = new Map<string, number>();
    if (seeCaisse) for (const r of dayRows) dayMap.set(r.date, Number(r.total));

    let garageTotal = 0;
    if (seeGarage) {
      for (const r of [...garageRepDays, ...garageCustDays]) {
        if (!slotSet.has(r.date)) continue;
        const v = Number(r.total);
        garageTotal += v;
        dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + v);
      }
    }

    const moduleDayGroups: { rows: { date: string; total: string }[]; see: boolean }[] = [
      { rows: taxiCitDays, see: seeTaxi },
      { rows: taxiCoDays, see: seeTaxi },
      { rows: taxiVipDays, see: seeTaxi },
      { rows: pawnSellDays, see: seePawnshop },
      { rows: chasseSellDays, see: seeChasse },
      { rows: runsDays, see: seeRuns },
      { rows: concDays, see: seeConcession },
      { rows: cargDays, see: seeCargaison },
    ];
    let moduleTotal = 0;
    for (const g of moduleDayGroups) {
      if (!g.see) continue;
      for (const r of g.rows) {
        if (!slotSet.has(r.date)) continue;
        const v = Number(r.total);
        moduleTotal += v;
        dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + v);
      }
    }

    const byDay: { date: string; total: number }[] = slots.map((d) => ({ date: d, total: round2(dayMap.get(d) ?? 0) }));

    const caisseTotal = seeCaisse ? Number(salesAgg[0]?.total ?? 0) : 0;
    const caisseCost = seeCaisse ? Number(salesAgg[0]?.cost ?? 0) : 0;
    const moduleCost =
      (seeConcession ? Number(concCostRow[0]?.c ?? 0) : 0) +
      (seeChasse ? Number(chasseBuyRow[0]?.c ?? 0) : 0) +
      (seePawnshop ? Number(pawnBuyRow[0]?.c ?? 0) : 0);
    const salesTotal = caisseTotal + garageTotal + moduleTotal;
    const salesCost = caisseCost + (seeGarage ? garageCost : 0) + moduleCost;

    res.json({
      sales: seeAnyRevenue
        ? {
            total: round2(salesTotal),
            count: seeCaisse ? Number(salesAgg[0]?.count ?? 0) : 0,
            margin: round2(salesTotal - salesCost),
            byDay,
            topProducts: seeCaisse ? topRows.map((r) => ({ name: r.name, revenue: round2(Number(r.revenue)) })) : [],
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
