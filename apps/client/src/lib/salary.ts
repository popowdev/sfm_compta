import { apiFetch } from './api';
import type { EmployeePosition } from '@rp-compta/shared';

export interface SalaryGridRow {
  position: EmployeePosition;
  hourlyRate: number;
  baseSalary: number;
}

export const getSalaryGrid = (companyId: number) =>
  apiFetch<{ canWrite: boolean; grid: SalaryGridRow[] }>(
    `/api/me/companies/${companyId}/salary-grid`,
  );

export const saveSalaryGrid = (companyId: number, grid: SalaryGridRow[]) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/salary-grid`, {
    method: 'PUT',
    body: JSON.stringify({ grid }),
  });
