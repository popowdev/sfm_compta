import { apiFetch } from './api';

export interface SalaryGridRow {
  companyRoleId: number;
  gradeName: string;
  rank: number;
  hourlyRate: number;
  baseSalary: number;
}

export const getSalaryGrid = (companyId: number) =>
  apiFetch<{ canWrite: boolean; grid: SalaryGridRow[] }>(
    `/api/me/companies/${companyId}/salary-grid`,
  );

export const saveSalaryGrid = (
  companyId: number,
  grid: { companyRoleId: number; hourlyRate: number; baseSalary: number }[],
) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/salary-grid`, {
    method: 'PUT',
    body: JSON.stringify({ grid }),
  });
