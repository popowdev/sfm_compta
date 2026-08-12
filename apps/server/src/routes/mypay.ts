import { Router, type Request } from 'express';
import { and, desc, eq, gte, inArray, isNotNull, lte, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { moduleConfigBool, moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import {
  exercices, exercicePayroll, companyEmployees, companyRoles, salaryGrid, companyModules, timeEntries,
  sales, garageRepairs, garageCustoms, taxiCitoyens, taxiConcitoyens, taxiVip, pawnshopTransactions, chasseTransactions, companyRuns, concessionSales,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { bizDate, bizWeek, bizPeakMinutes } from '../services/bizTime';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
export const meMyPayRouter = Router({ mergeParams: true });
meMyPayRouter.use(requireAuth);

meMyPayRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'badgeuse');
    if (!acc) return res.status(404).json({ error: 'not_member' });

    const empRows = await db
      .select({ id: companyEmployees.id, name: companyEmployees.name, iban: companyEmployees.iban, hourlyRate: companyEmployees.hourlyRate, commissionRate: companyEmployees.commissionRate, companyRoleId: companyEmployees.companyRoleId, userId: companyEmployees.userId, gradeName: companyRoles.name })
      .from(companyEmployees)
      .leftJoin(companyRoles, eq(companyEmployees.companyRoleId, companyRoles.id))
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.userId, req.user!.id)))
      .limit(1);
    const emp = empRows[0];
    if (!emp) return res.json({ hasFiche: false, weeks: [] });
    const userId = emp.userId!;

    const cfgRows = await db.select({ moduleKey: companyModules.moduleKey, config: companyModules.config }).from(companyModules).where(and(eq(companyModules.companyId, companyId), inArray(companyModules.moduleKey, ['badgeuse', 'caisse', 'garage', 'taxi', 'pawnshop', 'chasse'])));
    const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, unknown> | null;
    const cfg = (k: string) => parse(cfgRows.find((r) => r.moduleKey === k)?.config ?? null);
    const badge = cfg('badgeuse');
    const weeklyHoursCap = moduleConfigNumber(badge, 'badgeuse', 'weeklyHoursCap');
    const peakEnabled = moduleConfigBool(badge, 'badgeuse', 'heuresPointe');
    const peakMultiplier = moduleConfigNumber(badge, 'badgeuse', 'pointeMultiplier');
    const rateOf = (mod: string) => {
      const c = cfg(mod);
      return moduleConfigBool(c, mod as 'caisse', 'commissionCustom') ? moduleConfigNumber(c, mod as 'caisse', 'commissionRate') : Number(emp.commissionRate);
    };
    const caisseRate = rateOf('caisse'), taxiRate = rateOf('taxi'), pawnRate = rateOf('pawnshop'), chasseRate = rateOf('chasse');
    const garageCustom = moduleConfigBool(cfg('garage'), 'garage', 'commissionCustom');
    const garageRate = moduleConfigNumber(cfg('garage'), 'garage', 'commissionRate');

    const grid = await db.select().from(salaryGrid).where(and(eq(salaryGrid.companyId, companyId), emp.companyRoleId != null ? eq(salaryGrid.companyRoleId, emp.companyRoleId) : sql`1=0`)).limit(1);
    const g = grid[0];
    const rate = g && Number(g.hourlyRate) > 0 ? Number(g.hourlyRate) : Number(emp.hourlyRate);
    const baseSalary = g ? Number(g.baseSalary) : 0;

    const weekWindow = (offset: number) => {
      const { monday: start, sunday: end, label } = bizWeek(new Date(), offset);
      return { start, end, label };
    };
    const windows = Array.from({ length: 8 }, (_, i) => weekWindow(-i));
    const earliest = windows[windows.length - 1]!.start;

    const exRows = await db
      .select()
      .from(exercices)
      .where(and(eq(exercices.companyId, companyId), sql`DATEDIFF(${exercices.endDate}, ${exercices.startDate}) = 6`, gte(exercices.startDate, earliest)))
      .orderBy(desc(exercices.startDate));
    const exByRange = new Map(exRows.map((ex) => [`${ex.startDate}|${ex.endDate}`, ex]));

    const weeks = [];
    for (let wi = 0; wi < windows.length; wi++) {
      const w = windows[wi]!;
      const ex = exByRange.get(`${w.start}|${w.end}`) ?? null;
      const start = w.start, end = w.end;
      const inRange = (col: AnyColumn | SQL) => and(gte(bizDate(col), start), lte(bizDate(col), end));
      const [teRows, caisseAgg, garComm, garRev, garCustComm, garCustRev, taxiC, taxiCo, taxiV, pawnAgg, chasseAgg, runsAgg, concessionAgg] = await Promise.all([
        db.select({ clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, workedMin: sql<string>`GREATEST(0, TIMESTAMPDIFF(MINUTE, ${timeEntries.clockIn}, ${timeEntries.clockOut}) - ${timeEntries.pauseMinutes})` }).from(timeEntries).where(and(eq(timeEntries.companyId, companyId), eq(timeEntries.employeeId, emp.id), isNotNull(timeEntries.clockOut), inRange(timeEntries.clockIn))),
        db.select({ ca: sql<string>`COALESCE(SUM(${sales.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(sales).where(and(eq(sales.companyId, companyId), eq(sales.employeeId, emp.id), inRange(sales.createdAt))),
        db.select({ c: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}),0)` }).from(garageRepairs).where(and(eq(garageRepairs.companyId, companyId), eq(garageRepairs.mechanicUserId, userId), inRange(garageRepairs.createdAt))),
        db.select({ r: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(garageRepairs).where(and(eq(garageRepairs.companyId, companyId), eq(garageRepairs.mechanicUserId, userId), inRange(garageRepairs.createdAt))),
        db.select({ c: sql<string>`COALESCE(SUM(${garageCustoms.commissionAmount}),0)` }).from(garageCustoms).where(and(eq(garageCustoms.companyId, companyId), eq(garageCustoms.mechanicUserId, userId), inRange(garageCustoms.createdAt))),
        db.select({ r: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}),0)`, cnt: sql<number>`COUNT(*)` }).from(garageCustoms).where(and(eq(garageCustoms.companyId, companyId), eq(garageCustoms.mechanicUserId, userId), inRange(garageCustoms.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${taxiCitoyens.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(taxiCitoyens).where(and(eq(taxiCitoyens.companyId, companyId), eq(taxiCitoyens.driverUserId, userId), inRange(taxiCitoyens.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${taxiConcitoyens.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(taxiConcitoyens).where(and(eq(taxiConcitoyens.companyId, companyId), eq(taxiConcitoyens.driverUserId, userId), inRange(taxiConcitoyens.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${taxiVip.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(taxiVip).where(and(eq(taxiVip.companyId, companyId), eq(taxiVip.driverUserId, userId), inRange(taxiVip.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.createdByUserId, userId), eq(pawnshopTransactions.type, 'sell'), inRange(pawnshopTransactions.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${chasseTransactions.total}),0)` }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.createdByUserId, userId), eq(chasseTransactions.type, 'sell'), inRange(chasseTransactions.createdAt))),
        db.select({ c: sql<string>`COALESCE(SUM(${companyRuns.commission}),0)`, cnt: sql<string>`COALESCE(SUM(${companyRuns.qty}),0)` }).from(companyRuns).where(and(eq(companyRuns.companyId, companyId), eq(companyRuns.employeeId, emp.id), inRange(companyRuns.createdAt))),
        db.select({ c: sql<string>`COALESCE(SUM(${concessionSales.commission}),0)`, r: sql<string>`COALESCE(SUM(${concessionSales.salePrice}),0)`, cnt: sql<number>`COUNT(*)` }).from(concessionSales).where(and(eq(concessionSales.companyId, companyId), eq(concessionSales.createdByUserId, userId), inRange(concessionSales.createdAt))),
      ]);
      const override = ex
        ? await db.select().from(exercicePayroll).where(and(eq(exercicePayroll.exerciceId, ex.id), eq(exercicePayroll.employeeId, emp.id))).limit(1)
        : [];

      const rawMin = teRows.reduce((s, t) => s + Number(t.workedMin), 0);
      const rawHours = rawMin / 60;
      const caps = [ex ? Number(ex.hoursCap) : 0, weeklyHoursCap].filter((c) => c > 0);
      const cappedHours = caps.length ? Math.min(rawHours, ...caps) : rawHours;
      const base = Math.round(baseSalary + cappedHours * rate);
      const caisseCommission = Math.round((caisseRate / 100) * Number(caisseAgg[0]?.ca ?? 0));
      const garageRevenue = Number(garRev[0]?.r ?? 0) + Number(garCustRev[0]?.r ?? 0);
      const garageCommission = garageCustom ? Math.round((garageRate / 100) * garageRevenue) : Math.round(Number(garComm[0]?.c ?? 0) + Number(garCustComm[0]?.c ?? 0));
      const taxiRevenue = Number(taxiC[0]?.t ?? 0) + Number(taxiCo[0]?.t ?? 0) + Number(taxiV[0]?.t ?? 0);
      const coursesCount = Number(taxiC[0]?.cnt ?? 0) + Number(taxiCo[0]?.cnt ?? 0) + Number(taxiV[0]?.cnt ?? 0);
      const taxiCommission = Math.round((taxiRate / 100) * taxiRevenue);
      const pawnshopCommission = Math.round((pawnRate / 100) * Number(pawnAgg[0]?.t ?? 0));
      const chasseCommission = Math.round((chasseRate / 100) * Number(chasseAgg[0]?.t ?? 0));
      const runsCommission = Math.round(Number(runsAgg[0]?.c ?? 0));
      const concessionCommission = Math.round(Number(concessionAgg[0]?.c ?? 0));
      let peakMin = 0;
      if (peakEnabled && peakMultiplier > 1) for (const t of teRows) if (t.clockOut) peakMin += bizPeakMinutes(t.clockIn, t.clockOut);
      const peakHours = peakEnabled ? Math.min(peakMin / 60, cappedHours) : 0;
      const peakBonus = peakHours > 0 && peakMultiplier > 1 ? Math.round(peakHours * rate * (peakMultiplier - 1)) : 0;
      const o = override[0];
      const bonus = o ? Math.round(Number(o.bonus)) : 0;
      const deductions = o ? Math.round(Number(o.deductions)) : 0;
      const theoretical = Math.max(0, base + caisseCommission + garageCommission + taxiCommission + pawnshopCommission + chasseCommission + runsCommission + concessionCommission + bonus + peakBonus - deductions);
      const salaryCap = ex ? Number(ex.salaryCap) : 0;
      const paid = salaryCap > 0 ? Math.min(theoretical, Math.round(salaryCap)) : theoretical;

      const salesCount = Number(caisseAgg[0]?.cnt ?? 0);
      const garageCount = Number(garRev[0]?.cnt ?? 0) + Number(garCustRev[0]?.cnt ?? 0);
      const runsCount = Number(runsAgg[0]?.cnt ?? 0);
      const hasWork = rawMin > 0 || coursesCount > 0 || salesCount > 0 || garageCount > 0 || runsCount > 0 || Number(pawnAgg[0]?.t ?? 0) > 0 || Number(chasseAgg[0]?.t ?? 0) > 0 || Number(concessionAgg[0]?.r ?? 0) > 0;
      if (wi > 0 && !ex && !hasWork) continue;

      weeks.push({
        exerciceId: ex ? ex.id : null,
        label: ex ? ex.label : w.label,
        startDate: start,
        endDate: end,
        status: ex ? ex.status : 'none',
        hours: Math.round(rawHours * 10) / 10,
        cappedHours: Math.round(cappedHours * 10) / 10,
        base,
        caisseCommission,
        garageCommission,
        taxiCommission,
        pawnshopCommission,
        chasseCommission,
        runsCommission,
        concessionCommission,
        peakBonus,
        bonus,
        deductions,
        paid: Math.round(paid),
        coursesCount,
        salesCount,
        garageCount,
        runsCount,
        isPaid: o?.paid ?? false,
      });
    }

    res.json({ hasFiche: true, employee: { name: emp.name, iban: emp.iban, gradeName: emp.gradeName, commissionRate: Number(emp.commissionRate) }, weeks });
  }),
);
