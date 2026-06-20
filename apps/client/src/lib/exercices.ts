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
  notes: string | null;
  createdAt: string;
}

export interface ExerciceInput {
  label: string;
  startDate: string;
  endDate: string;
  revenue?: number;
  dividends?: number;
  notes?: string;
}

export interface ExercicePatch {
  label?: string;
  status?: ExerciceStatus;
  revenue?: number;
  dividends?: number;
  notes?: string;
}

export interface PayrollLine {
  employeeId: number;
  name: string;
  position: string;
  hours: number;
  hourlyRate: number;
  salary: number;
}

export interface ExerciceSummary {
  revenue: number;
  expensesTotal: number;
  expensesDeductible: number;
  payrollTotal: number;
  charges: number;
  benefit: number;
  dividends: number;
  corporateTax: number;
  dividendTax: number;
  dividendTaxRate: number;
  totalTax: number;
  netAfterTax: number;
}

export interface ExerciceDetail extends Exercice {
  canWrite: boolean;
  payrollVisible: boolean;
  summary: ExerciceSummary;
  payroll: PayrollLine[];
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
