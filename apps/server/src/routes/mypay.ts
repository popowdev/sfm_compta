import { Router, type Request } from 'express';
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { moduleConfigBool, moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import {
  exercices, exercicePayroll, companyEmployees, companyRoles, salaryGrid, companyModules, timeEntries,
  sales, garageRepairs, garageCustoms, taxiCitoyens, taxiConcitoyens, taxiVip, pawnshopTransactions, companyRuns,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function entryToMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(s);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}
function peakMinutes(inStr: string, outStr: string): number {
  const start = entryToMs(inStr), end = entryToMs(outStr);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const DAY = 86_400_000, HOUR = 3_600_000;
  const d = new Date(start);
  let day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let total = 0;
  for (; day < end; day += DAY) {
    const s = Math.max(start, day + 21 * HOUR);
    const e = Math.min(end, day + DAY);
    if (e > s) total += (e - s) / 60_000;
  }
  return total;
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

    const cfgRows = await db.select({ moduleKey: companyModules.moduleKey, config: companyModules.config }).from(companyModules).where(and(eq(companyModules.companyId, companyId), inArray(companyModules.moduleKey, ['badgeuse', 'caisse', 'garage', 'taxi', 'pawnshop'])));
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
    const caisseRate = rateOf('caisse'), taxiRate = rateOf('taxi'), pawnRate = rateOf('pawnshop');
    const garageCustom = moduleConfigBool(cfg('garage'), 'garage', 'commissionCustom');
    const garageRate = moduleConfigNumber(cfg('garage'), 'garage', 'commissionRate');

    const grid = await db.select().from(salaryGrid).where(and(eq(salaryGrid.companyId, companyId), emp.companyRoleId != null ? eq(salaryGrid.companyRoleId, emp.companyRoleId) : sql`1=0`)).limit(1);
    const g = grid[0];
    const rate = g && Number(g.hourlyRate) > 0 ? Number(g.hourlyRate) : Number(emp.hourlyRate);
    const baseSalary = g ? Number(g.baseSalary) : 0;

    const exRows = await db
      .select()
      .from(exercices)
      .where(and(eq(exercices.companyId, companyId), sql`DATEDIFF(${exercices.endDate}, ${exercices.startDate}) = 6`))
      .orderBy(desc(exercices.startDate))
      .limit(8);

    const weeks = [];
    for (const ex of exRows) {
      const start = ex.startDate, end = ex.endDate;
      const inRange = (col: unknown) => and(gte(sql`DATE(${col})`, start), lte(sql`DATE(${col})`, end));
      const [teRows, caisseAgg, garComm, garRev, taxiC, taxiCo, taxiV, pawnAgg, runsAgg, override] = await Promise.all([
        db.select({ clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, workedMin: sql<string>`GREATEST(0, TIMESTAMPDIFF(MINUTE, ${timeEntries.clockIn}, ${timeEntries.clockOut}) - ${timeEntries.pauseMinutes})` }).from(timeEntries).where(and(eq(timeEntries.companyId, companyId), eq(timeEntries.employeeId, emp.id), isNotNull(timeEntries.clockOut), inRange(timeEntries.clockIn))),
        db.select({ ca: sql<string>`COALESCE(SUM(${sales.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(sales).where(and(eq(sales.companyId, companyId), eq(sales.employeeId, emp.id), inRange(sales.createdAt))),
        db.select({ c: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}),0)` }).from(garageRepairs).where(and(eq(garageRepairs.companyId, companyId), eq(garageRepairs.mechanicUserId, userId), inRange(garageRepairs.createdAt))),
        db.select({ r: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(garageRepairs).where(and(eq(garageRepairs.companyId, companyId), eq(garageRepairs.mechanicUserId, userId), inRange(garageRepairs.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${taxiCitoyens.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(taxiCitoyens).where(and(eq(taxiCitoyens.companyId, companyId), eq(taxiCitoyens.driverUserId, userId), inRange(taxiCitoyens.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${taxiConcitoyens.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(taxiConcitoyens).where(and(eq(taxiConcitoyens.companyId, companyId), eq(taxiConcitoyens.driverUserId, userId), inRange(taxiConcitoyens.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${taxiVip.total}),0)`, cnt: sql<number>`COUNT(*)` }).from(taxiVip).where(and(eq(taxiVip.companyId, companyId), eq(taxiVip.driverUserId, userId), inRange(taxiVip.createdAt))),
        db.select({ t: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.createdByUserId, userId), eq(pawnshopTransactions.type, 'sell'), inRange(pawnshopTransactions.createdAt))),
        db.select({ c: sql<string>`COALESCE(SUM(${companyRuns.commission}),0)`, cnt: sql<string>`COALESCE(SUM(${companyRuns.qty}),0)` }).from(companyRuns).where(and(eq(companyRuns.companyId, companyId), eq(companyRuns.employeeId, emp.id), inRange(companyRuns.createdAt))),
        db.select().from(exercicePayroll).where(and(eq(exercicePayroll.exerciceId, ex.id), eq(exercicePayroll.employeeId, emp.id))).limit(1),
      ]);

      const rawMin = teRows.reduce((s, t) => s + Number(t.workedMin), 0);
      const rawHours = rawMin / 60;
      const caps = [Number(ex.hoursCap), weeklyHoursCap].filter((c) => c > 0);
      const cappedHours = caps.length ? Math.min(rawHours, ...caps) : rawHours;
      const base = Math.round(baseSalary + cappedHours * rate);
      const caisseCommission = Math.round((caisseRate / 100) * Number(caisseAgg[0]?.ca ?? 0));
      const garageCommission = garageCustom ? Math.round((garageRate / 100) * Number(garRev[0]?.r ?? 0)) : Math.round(Number(garComm[0]?.c ?? 0));
      const taxiRevenue = Number(taxiC[0]?.t ?? 0) + Number(taxiCo[0]?.t ?? 0) + Number(taxiV[0]?.t ?? 0);
      const coursesCount = Number(taxiC[0]?.cnt ?? 0) + Number(taxiCo[0]?.cnt ?? 0) + Number(taxiV[0]?.cnt ?? 0);
      const taxiCommission = Math.round((taxiRate / 100) * taxiRevenue);
      const pawnshopCommission = Math.round((pawnRate / 100) * Number(pawnAgg[0]?.t ?? 0));
      const runsCommission = Math.round(Number(runsAgg[0]?.c ?? 0));
      let peakMin = 0;
      if (peakEnabled && peakMultiplier > 1) for (const t of teRows) if (t.clockOut) peakMin += peakMinutes(t.clockIn, t.clockOut);
      const peakHours = peakEnabled ? Math.min(peakMin / 60, cappedHours) : 0;
      const peakBonus = peakHours > 0 && peakMultiplier > 1 ? Math.round(peakHours * rate * (peakMultiplier - 1)) : 0;
      const o = override[0];
      const bonus = o ? Math.round(Number(o.bonus)) : 0;
      const deductions = o ? Math.round(Number(o.deductions)) : 0;
      const theoretical = Math.max(0, base + caisseCommission + garageCommission + taxiCommission + pawnshopCommission + runsCommission + bonus + peakBonus - deductions);
      const paid = Number(ex.salaryCap) > 0 ? Math.min(theoretical, Math.round(Number(ex.salaryCap))) : theoretical;

      weeks.push({
        exerciceId: ex.id,
        label: ex.label,
        startDate: start,
        endDate: end,
        status: ex.status,
        hours: Math.round(rawHours * 10) / 10,
        cappedHours: Math.round(cappedHours * 10) / 10,
        base,
        caisseCommission,
        garageCommission,
        taxiCommission,
        pawnshopCommission,
        runsCommission,
        peakBonus,
        bonus,
        deductions,
        paid: Math.round(paid),
        coursesCount,
        salesCount: Number(caisseAgg[0]?.cnt ?? 0),
        garageCount: Number(garRev[0]?.cnt ?? 0),
        runsCount: Number(runsAgg[0]?.cnt ?? 0),
        isPaid: o?.paid ?? false,
      });
    }

    res.json({ hasFiche: true, employee: { name: emp.name, iban: emp.iban, gradeName: emp.gradeName, commissionRate: Number(emp.commissionRate) }, weeks });
  }),
);
