import { apiFetch } from './api';
import type { EmployeePosition, ContractType } from '@rp-compta/shared';

export interface Employee {
  id: number;
  companyId: number;
  name: string;
  phone: string | null;
  dateOfBirth: string | null;
  hireDate: string | null;
  position: EmployeePosition;
  contractType: ContractType;
  contractSigned: boolean;
  hourlyRate: number;
  commissionRate: number;
  warnings: number;
  terminationReason: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
}

export interface EmployeeInput {
  name: string;
  phone?: string;
  dateOfBirth?: string;
  hireDate?: string;
  position: EmployeePosition;
  contractType: ContractType;
  contractSigned: boolean;
  hourlyRate: number;
  commissionRate: number;
  warnings: number;
  terminationReason?: string;
  active: boolean;
  notes?: string;
}

export const getEmployees = (companyId: number) =>
  apiFetch<{ canWrite: boolean; employees: Employee[] }>(
    `/api/me/companies/${companyId}/employees`,
  );

export const createEmployee = (companyId: number, body: EmployeeInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/employees`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateEmployee = (companyId: number, id: number, body: EmployeeInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteEmployee = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/employees/${id}`, {
    method: 'DELETE',
  });
