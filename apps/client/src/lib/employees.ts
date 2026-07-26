import { apiFetch } from './api';
import type { ContractType } from '@rp-compta/shared';

export interface Employee {
  id: number;
  companyId: number;
  userId: number | null;
  name: string;
  phone: string | null;
  iban: string | null;
  dateOfBirth: string | null;
  hireDate: string | null;
  companyRoleId: number | null;
  contractType: ContractType;
  contractSigned: boolean;
  hourlyRate: number;
  commissionRate: number;
  warnings: number;
  terminationReason: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  gradeName: string | null;
  linkedName: string | null;
}

export interface CompanyMemberRef {
  userId: number;
  name: string;
  gradeName: string | null;
}

export interface EmployeeInput {
  userId?: number;
  name: string;
  phone?: string;
  iban?: string;
  dateOfBirth?: string;
  hireDate?: string;
  companyRoleId?: number | null;
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
  apiFetch<{ canWrite: boolean; employees: Employee[]; members: CompanyMemberRef[] }>(
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
