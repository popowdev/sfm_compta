import { and, eq, gte, inArray, isNotNull, lte, ne, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { moduleConfigBool, moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import {
  companyModules, companyExpenses, companyEmployees, companyRoles, salaryGrid, timeEntries,
  sales, garageRepairs, garageCustoms, taxiCitoyens, taxiConcitoyens, taxiVip,
  pawnshopTransactions, chasseTransactions, companyRuns, concessionSales,
  companyCargaisons, cargaisonParticipants,
} from '../db/schema';
import { bizDate, bizPeakMinutes } from './bizTime';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface WeeklyCharges {
  caNet: number;
  expenses: number;
  payroll: number;
  charges: number;
  benefit: number;
}

// Miroir du calcul financier de l'exercice comptable (routes/exercices.ts) pour une
// semaine SANS exercice : hoursCap = 0, pas de plafond salaire, pas d'ajustements
// (prime/retenue). À GARDER EN PHASE avec la paie de exercices.ts.
export async function computeWeeklyCharges(companyId: number, start: string, end: string): Promise<WeeklyCharges> {
  const inDay = (col: AnyColumn | SQL) => and(gte(bizDate(col), start), lte(bizDate(col), end));

  const modConfigRows = await db
    .select({ moduleKey: companyModules.moduleKey, config: companyModules.config })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, companyId), inArray(companyModules.moduleKey, ['badgeuse', 'taxi', 'pawnshop', 'caisse', 'garage', 'chasse'])));
  const cfg = (k: string) => {
    const v = modConfigRows.find((r) => r.moduleKey === k)?.config ?? null;
    return (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, unknown> | null;
  };
  const badge = cfg('badgeuse');
  const weeklyHoursCap = moduleConfigNumber(badge, 'badgeuse', 'weeklyHoursCap');
  const peakEnabled = moduleConfigBool(badge, 'badgeuse', 'heuresPointe');
  const peakMultiplier = moduleConfigNumber(badge, 'badgeuse', 'pointeMultiplier');
  const caisseCfg = cfg('caisse'), garageCfg = cfg('garage'), taxiCfg = cfg('taxi'), pawnCfg = cfg('pawnshop'), chasseCfg = cfg('chasse');
  const caisseCommCustom = moduleConfigBool(caisseCfg, 'caisse', 'commissionCustom');
  const caisseCommRate = moduleConfigNumber(caisseCfg, 'caisse', 'commissionRate');
  const garageCommCustom = moduleConfigBool(garageCfg, 'garage', 'commissionCustom');
  const garageCommRate = moduleConfigNumber(garageCfg, 'garage', 'commissionRate');
  const taxiCommCustom = moduleConfigBool(taxiCfg, 'taxi', 'commissionCustom');
  const taxiCommRate = moduleConfigNumber(taxiCfg, 'taxi', 'commissionRate');
  const pawnCommCustom = moduleConfigBool(pawnCfg, 'pawnshop', 'commissionCustom');
  const pawnCommRate = moduleConfigNumber(pawnCfg, 'pawnshop', 'commissionRate');
  const chasseCommCustom = moduleConfigBool(chasseCfg, 'chasse', 'commissionCustom');
  const chasseCommRate = moduleConfigNumber(chasseCfg, 'chasse', 'commissionRate');

  const [
    expRow, salesAgg, salesByEmpRows, payRows, gridRows, empRows,
    runsCommRows, runsRevRow, taxiC, taxiCo, taxiV, pawnSell, chasseSell, concessionRows,
    repByUser, custByUser, rawPeak,
  ] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${companyExpenses.amount}),0)` }).from(companyExpenses).where(and(eq(companyExpenses.companyId, companyId), ne(companyExpenses.category, 'salary'), gte(companyExpenses.expenseDate, start), lte(companyExpenses.expenseDate, end))),
    db.select({ gross: sql<string>`COALESCE(SUM(${sales.subtotal}),0)`, discount: sql<string>`COALESCE(SUM(${sales.discount}),0)` }).from(sales).where(and(eq(sales.companyId, companyId), inDay(sales.createdAt))),
    db.select({ empId: sales.employeeId, ca: sql<string>`COALESCE(SUM(${sales.total}),0)` }).from(sales).where(and(eq(sales.companyId, companyId), inDay(sales.createdAt))).groupBy(sales.employeeId),
    db.select({ employeeId: companyEmployees.id, companyRoleId: companyEmployees.companyRoleId, hourlyRate: companyEmployees.hourlyRate, commissionRate: companyEmployees.commissionRate, workedMin: sql<string>`COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(MINUTE, ${timeEntries.clockIn}, ${timeEntries.clockOut}) - ${timeEntries.pauseMinutes})), 0)` }).from(companyEmployees).leftJoin(timeEntries, and(eq(timeEntries.employeeId, companyEmployees.id), eq(timeEntries.companyId, companyId), isNotNull(timeEntries.clockOut), inDay(timeEntries.clockIn))).leftJoin(companyRoles, eq(companyEmployees.companyRoleId, companyRoles.id)).where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true))).groupBy(companyEmployees.id),
    db.select().from(salaryGrid).where(eq(salaryGrid.companyId, companyId)),
    db.select({ id: companyEmployees.id, userId: companyEmployees.userId }).from(companyEmployees).where(eq(companyEmployees.companyId, companyId)),
    db.select({ employeeId: companyRuns.employeeId, comm: sql<string>`COALESCE(SUM(${companyRuns.commission}),0)` }).from(companyRuns).where(and(eq(companyRuns.companyId, companyId), inDay(companyRuns.createdAt))).groupBy(companyRuns.employeeId),
    db.select({ total: sql<string>`COALESCE(SUM(${companyRuns.total}),0)` }).from(companyRuns).where(and(eq(companyRuns.companyId, companyId), inDay(companyRuns.createdAt))),
    db.select({ userId: taxiCitoyens.driverUserId, total: sql<string>`COALESCE(SUM(${taxiCitoyens.total}),0)` }).from(taxiCitoyens).where(and(eq(taxiCitoyens.companyId, companyId), inDay(taxiCitoyens.createdAt))).groupBy(taxiCitoyens.driverUserId),
    db.select({ userId: taxiConcitoyens.driverUserId, total: sql<string>`COALESCE(SUM(${taxiConcitoyens.total}),0)` }).from(taxiConcitoyens).where(and(eq(taxiConcitoyens.companyId, companyId), inDay(taxiConcitoyens.createdAt))).groupBy(taxiConcitoyens.driverUserId),
    db.select({ userId: taxiVip.driverUserId, total: sql<string>`COALESCE(SUM(${taxiVip.total}),0)` }).from(taxiVip).where(and(eq(taxiVip.companyId, companyId), inDay(taxiVip.createdAt))).groupBy(taxiVip.driverUserId),
    db.select({ userId: pawnshopTransactions.createdByUserId, total: sql<string>`COALESCE(SUM(${pawnshopTransactions.total}),0)` }).from(pawnshopTransactions).where(and(eq(pawnshopTransactions.companyId, companyId), eq(pawnshopTransactions.type, 'sell'), inDay(pawnshopTransactions.createdAt))).groupBy(pawnshopTransactions.createdByUserId),
    db.select({ userId: chasseTransactions.createdByUserId, total: sql<string>`COALESCE(SUM(${chasseTransactions.total}),0)` }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.type, 'sell'), inDay(chasseTransactions.createdAt))).groupBy(chasseTransactions.createdByUserId),
    db.select({ userId: concessionSales.createdByUserId, comm: sql<string>`COALESCE(SUM(${concessionSales.commission}),0)`, total: sql<string>`COALESCE(SUM(${concessionSales.salePrice}),0)` }).from(concessionSales).where(and(eq(concessionSales.companyId, companyId), inDay(concessionSales.createdAt))).groupBy(concessionSales.createdByUserId),
    db.select({ userId: garageRepairs.mechanicUserId, commission: sql<string>`COALESCE(SUM(${garageRepairs.commissionAmount}),0)`, revenue: sql<string>`COALESCE(SUM(${garageRepairs.total}),0)` }).from(garageRepairs).where(and(eq(garageRepairs.companyId, companyId), inDay(garageRepairs.createdAt))).groupBy(garageRepairs.mechanicUserId),
    db.select({ userId: garageCustoms.mechanicUserId, commission: sql<string>`COALESCE(SUM(${garageCustoms.commissionAmount}),0)`, revenue: sql<string>`COALESCE(SUM(${garageCustoms.finalPrice}),0)` }).from(garageCustoms).where(and(eq(garageCustoms.companyId, companyId), inDay(garageCustoms.createdAt))).groupBy(garageCustoms.mechanicUserId),
    peakEnabled && peakMultiplier > 1
      ? db.select({ employeeId: timeEntries.employeeId, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut }).from(timeEntries).where(and(eq(timeEntries.companyId, companyId), isNotNull(timeEntries.clockOut), inDay(timeEntries.clockIn)))
      : Promise.resolve([] as { employeeId: number; clockIn: string; clockOut: string | null }[]),
  ]);

  const [cargaisonRevRow, cargaisonShareRows] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${companyCargaisons.total}),0)`, importCost: sql<string>`COALESCE(SUM(${companyCargaisons.importCost}),0)` }).from(companyCargaisons).where(and(eq(companyCargaisons.companyId, companyId), inDay(companyCargaisons.createdAt))),
    db.select({ employeeId: cargaisonParticipants.employeeId, share: sql<string>`COALESCE(SUM(${cargaisonParticipants.share}),0)` }).from(cargaisonParticipants).innerJoin(companyCargaisons, eq(cargaisonParticipants.cargaisonId, companyCargaisons.id)).where(and(eq(companyCargaisons.companyId, companyId), inDay(companyCargaisons.createdAt))).groupBy(cargaisonParticipants.employeeId),
  ]);

  const empByUser = new Map<number, number>();
  for (const e of empRows) if (e.userId != null) empByUser.set(e.userId, e.id);

  const salesByEmp = new Map<number, number>();
  for (const r of salesByEmpRows) if (r.empId != null) salesByEmp.set(r.empId, Number(r.ca));

  const garageCommByEmp = new Map<number, number>();
  const garageRevByEmp = new Map<number, number>();
  const addGarage = (userId: number | null, commission: number, revenue: number) => {
    if (userId == null) return;
    const empId = empByUser.get(userId);
    if (empId == null) return;
    garageCommByEmp.set(empId, (garageCommByEmp.get(empId) ?? 0) + commission);
    garageRevByEmp.set(empId, (garageRevByEmp.get(empId) ?? 0) + revenue);
  };
  let garageRevenueTotal = 0;
  for (const r of repByUser) { addGarage(r.userId, Number(r.commission), Number(r.revenue)); garageRevenueTotal += Number(r.revenue); }
  for (const c of custByUser) { addGarage(c.userId, Number(c.commission), Number(c.revenue)); garageRevenueTotal += Number(c.revenue); }

  const taxiRevByEmp = new Map<number, number>();
  const pawnshopRevByEmp = new Map<number, number>();
  const chasseRevByEmp = new Map<number, number>();
  const concessionRevByEmp = new Map<number, number>();
  const concessionCommByEmp = new Map<number, number>();
  const addRev = (map: Map<number, number>, userId: number | null, total: number) => {
    if (userId == null) return;
    const empId = empByUser.get(userId);
    if (empId == null) return;
    map.set(empId, (map.get(empId) ?? 0) + total);
  };
  let moduleRevenue = 0;
  for (const r of taxiC) { addRev(taxiRevByEmp, r.userId, Number(r.total)); moduleRevenue += Number(r.total); }
  for (const r of taxiCo) { addRev(taxiRevByEmp, r.userId, Number(r.total)); moduleRevenue += Number(r.total); }
  for (const r of taxiV) { addRev(taxiRevByEmp, r.userId, Number(r.total)); moduleRevenue += Number(r.total); }
  for (const r of pawnSell) { addRev(pawnshopRevByEmp, r.userId, Number(r.total)); moduleRevenue += Number(r.total); }
  for (const r of chasseSell) { addRev(chasseRevByEmp, r.userId, Number(r.total)); moduleRevenue += Number(r.total); }
  for (const r of concessionRows) {
    addRev(concessionRevByEmp, r.userId, Number(r.total));
    moduleRevenue += Number(r.total);
    const empId = r.userId != null ? empByUser.get(r.userId) : undefined;
    if (empId != null) concessionCommByEmp.set(empId, (concessionCommByEmp.get(empId) ?? 0) + Number(r.comm));
  }
  moduleRevenue += Number(runsRevRow[0]?.total ?? 0);
  moduleRevenue += Number(cargaisonRevRow[0]?.total ?? 0);

  const runsCommByEmp = new Map<number, number>();
  for (const r of runsCommRows) if (r.employeeId != null) runsCommByEmp.set(r.employeeId, Number(r.comm));
  const cargaisonShareByEmp = new Map<number, number>();
  for (const r of cargaisonShareRows) if (r.employeeId != null) cargaisonShareByEmp.set(r.employeeId, Number(r.share));

  const peakMinByEmp = new Map<number, number>();
  for (const e of rawPeak) {
    if (!e.clockOut) continue;
    const pm = bizPeakMinutes(e.clockIn, e.clockOut);
    if (pm > 0) peakMinByEmp.set(e.employeeId, (peakMinByEmp.get(e.employeeId) ?? 0) + pm);
  }

  const gridByRole = new Map(gridRows.map((g) => [g.companyRoleId, g]));

  let payrollTotal = 0;
  for (const r of payRows) {
    const rawHours = Number(r.workedMin) / 60;
    const cappedHours = weeklyHoursCap > 0 ? Math.min(rawHours, weeklyHoursCap) : rawHours;
    const g = r.companyRoleId != null ? gridByRole.get(r.companyRoleId) : undefined;
    const rate = g && Number(g.hourlyRate) > 0 ? Number(g.hourlyRate) : Number(r.hourlyRate);
    const baseSalary = g ? Number(g.baseSalary) : 0;
    const base = Math.round(baseSalary + cappedHours * rate);
    const gradeRate = Number(r.commissionRate);
    const caisseCommission = Math.round(((caisseCommCustom ? caisseCommRate : gradeRate) / 100) * (salesByEmp.get(r.employeeId) ?? 0));
    const garageCommission = garageCommCustom
      ? Math.round((garageCommRate / 100) * (garageRevByEmp.get(r.employeeId) ?? 0))
      : Math.round(garageCommByEmp.get(r.employeeId) ?? 0);
    const taxiCommission = Math.round(((taxiCommCustom ? taxiCommRate : gradeRate) / 100) * Math.round(taxiRevByEmp.get(r.employeeId) ?? 0));
    const pawnshopCommission = Math.round(((pawnCommCustom ? pawnCommRate : gradeRate) / 100) * Math.round(pawnshopRevByEmp.get(r.employeeId) ?? 0));
    const chasseCommission = Math.round(((chasseCommCustom ? chasseCommRate : gradeRate) / 100) * Math.round(chasseRevByEmp.get(r.employeeId) ?? 0));
    const runsCommission = Math.round(runsCommByEmp.get(r.employeeId) ?? 0);
    const concessionCommission = Math.round(concessionCommByEmp.get(r.employeeId) ?? 0);
    const cargaisonShare = Math.round(cargaisonShareByEmp.get(r.employeeId) ?? 0);
    const peakHours = peakEnabled ? Math.min((peakMinByEmp.get(r.employeeId) ?? 0) / 60, cappedHours) : 0;
    const peakBonus = peakHours > 0 && peakMultiplier > 1 ? Math.round(peakHours * rate * (peakMultiplier - 1)) : 0;
    const paid = Math.max(0, base + caisseCommission + garageCommission + taxiCommission + pawnshopCommission + chasseCommission + runsCommission + concessionCommission + cargaisonShare + peakBonus);
    payrollTotal += paid;
  }

  const salesGross = Number(salesAgg[0]?.gross ?? 0);
  const salesDiscount = Number(salesAgg[0]?.discount ?? 0);
  const caGross = round2(salesGross + garageRevenueTotal + moduleRevenue);
  const caNet = round2(caGross - salesDiscount);
  const expenses = round2(Number(expRow[0]?.total ?? 0) + Number(cargaisonRevRow[0]?.importCost ?? 0));
  const payroll = round2(payrollTotal);
  const charges = round2(expenses + payroll);
  const benefit = round2(caNet - charges);
  return { caNet, expenses, payroll, charges, benefit };
}
