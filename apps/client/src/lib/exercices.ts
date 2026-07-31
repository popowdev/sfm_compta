import { apiFetch } from './api';

export type ExerciceStatus = 'open' | 'closed';

export interface Exercice {
  id: number;
  companyId: number;
  label: string;
  startDate: string;
  endDate: string;
  status: ExerciceStatus;
  revenue: number;
  dividends: number;
  hoursCap: number;
  salaryCap: number;
  notes: string | null;
  createdAt: string;
}

export interface ExerciceInput {
  label: string;
  startDate: string;
  endDate: string;
  revenue?: number;
  dividends?: number;
  hoursCap?: number;
  salaryCap?: number;
  notes?: string;
}

export interface ExercicePatch {
  label?: string;
  status?: ExerciceStatus;
  revenue?: number;
  dividends?: number;
  hoursCap?: number;
  salaryCap?: number;
  notes?: string;
}

export interface PayrollLine {
  employeeId: number;
  name: string;
  companyRoleId: number | null;
  gradeName: string | null;
  hours: number;
  cappedHours: number;
  peakHours: number;
  peakBonus: number;
  hourlyRate: number;
  base: number;
  commission: number;
  garageCommission: number;
  taxiCommission: number;
  pawnshopCommission: number;
  runsCommission: number;
  taxiRevenue: number;
  pawnshopRevenue: number;
  bonus: number;
  deductions: number;
  theoretical: number;
  paid: number;
  excess: number;
  notes: string | null;
  isPaid: boolean;
  paidAt: string | null;
}

export interface PayrollInput {
  bonus: number;
  deductions: number;
  notes?: string;
}

export interface ExerciceSummary {
  revenue: number;
  salesRevenue: number;
  garageRevenue: number;
  garageCommission: number;
  taxiCommission: number;
  pawnshopCommission: number;
  runsCommission: number;
  peakBonus: number;
  peakEnabled: boolean;
  peakMultiplier: number;
  weeklyHoursCap: number;
  caGross: number;
  salesDiscount: number;
  caNet: number;
  totalRevenue: number;
  productionCost: number;
  grossMargin: number;
  componentPurchases: number;
  salesCount: number;
  expensesTotal: number;
  expensesDeductible: number;
  payrollTotal: number;
  excessToCompany: number;
  charges: number;
  benefit: number;
  taxableBenefit: number;
  effectiveRate: number;
  dividends: number;
  corporateTax: number;
  dividendTax: number;
  dividendTaxRate: number;
  totalTax: number;
  netAfterTax: number;
}

export interface ExpenseCategoryLine {
  category: string;
  total: number;
}
export interface SalesDayPoint {
  date: string;
  total: number;
}
export interface PaymentSlice {
  method: string;
  total: number;
  count: number;
}
export interface EmployeePerf {
  employeeId: number;
  name: string;
  salesCount: number;
  ca: number;
  discounts: number;
}
export interface TopProduct {
  name: string;
  qty: number;
  ca: number;
  cost: number;
  margin: number;
}
export interface ExerciceSaleRow {
  id: number;
  createdAt: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  employeeName: string | null;
  clientName: string | null;
}

export interface ExerciceDetail extends Exercice {
  canWrite: boolean;
  canEdit: boolean;
  payrollVisible: boolean;
  stocksEnabled: boolean;
  summary: ExerciceSummary;
  expensesByCategory: ExpenseCategoryLine[];
  payroll: PayrollLine[];
  salesByDay: SalesDayPoint[];
  salesByPayment: PaymentSlice[];
  perfByEmployee: EmployeePerf[];
  topProducts: TopProduct[];
  salesList: ExerciceSaleRow[];
}

export const getExercices = (companyId: number) =>
  apiFetch<{ canWrite: boolean; exercices: Exercice[] }>(`/api/me/companies/${companyId}/exercices`);

export const getExercice = (companyId: number, id: number) =>
  apiFetch<ExerciceDetail>(`/api/me/companies/${companyId}/exercices/${id}`);

export const createExercice = (companyId: number, body: ExerciceInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/exercices`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const generateWeek = (companyId: number, offset: number) =>
  apiFetch<{ ok: boolean; existing: boolean; id?: number }>(`/api/me/companies/${companyId}/exercices/generate-week`, {
    method: 'POST',
    body: JSON.stringify({ offset }),
  });

export const updateExercice = (companyId: number, id: number, body: ExercicePatch) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/exercices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteExercice = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/exercices/${id}`, { method: 'DELETE' });

export const setExercicePayroll = (
  companyId: number,
  id: number,
  employeeId: number,
  body: PayrollInput,
) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/exercices/${id}/payroll/${employeeId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const setExercicePaid = (companyId: number, id: number, employeeId: number, paid: boolean) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/exercices/${id}/payroll/${employeeId}/paid`, {
    method: 'PUT',
    body: JSON.stringify({ paid }),
  });
