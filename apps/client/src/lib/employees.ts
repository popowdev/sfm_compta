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

const eBase = (companyId: number) => `/api/me/companies/${companyId}/employees`;

export interface EmployeePerf {
  caisse: { revenue: number; count: number };
  garage: { revenue: number; count: number };
  taxi: { revenue: number; count: number };
  pawnshop: { revenue: number; count: number };
  chasse: { revenue: number; count: number };
  hours: number;
  totalRevenue: number;
}
export const getEmployeesPerformance = (companyId: number, range?: { from: string; to: string }) =>
  apiFetch<{ performance: Record<number, EmployeePerf>; from: string | null; to: string | null }>(
    `${eBase(companyId)}/performance${range ? `?from=${range.from}&to=${range.to}` : ''}`,
  );

export interface Warning { id: number; reason: string; createdAt: string }
export interface PersonnelRow {
  id: number;
  name: string;
  active: boolean;
  roleName: string | null;
  contractSigned: boolean;
  medicalVisit: boolean;
  warnings: Warning[];
  vehicles: { id: number; plate: string; perf: boolean }[];
}
export const getPersonnel = (companyId: number) =>
  apiFetch<{ canWrite: boolean; rows: PersonnelRow[] }>(`${eBase(companyId)}/personnel`);
export const updatePersonnel = (companyId: number, employeeId: number, body: Partial<{ contractSigned: boolean; medicalVisit: boolean }>) =>
  apiFetch<{ ok: boolean }>(`${eBase(companyId)}/personnel/${employeeId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const addWarning = (companyId: number, employeeId: number, reason: string) =>
  apiFetch<{ ok: boolean; id: number }>(`${eBase(companyId)}/personnel/${employeeId}/warnings`, { method: 'POST', body: JSON.stringify({ reason }) });
export const deleteWarning = (companyId: number, employeeId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${eBase(companyId)}/personnel/${employeeId}/warnings/${id}`, { method: 'DELETE' });

export interface Vehicle { id: number; plate: string; perf: boolean; assignedEmployeeId: number | null; assignedName: string | null; notes: string | null; createdAt: string }
export const getVehicles = (companyId: number) =>
  apiFetch<{ canWrite: boolean; employees: { id: number; name: string }[]; stats: { total: number; perf: number; assigned: number; available: number }; rows: Vehicle[] }>(`${eBase(companyId)}/vehicles`);
export const createVehicle = (companyId: number, body: { plate: string; perf?: boolean; assignedEmployeeId?: number | null; notes?: string | null }) =>
  apiFetch<{ ok: boolean; id: number }>(`${eBase(companyId)}/vehicles`, { method: 'POST', body: JSON.stringify(body) });
export const updateVehicle = (companyId: number, id: number, body: Partial<{ plate: string; perf: boolean; assignedEmployeeId: number | null; notes: string | null }>) =>
  apiFetch<{ ok: boolean }>(`${eBase(companyId)}/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteVehicle = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${eBase(companyId)}/vehicles/${id}`, { method: 'DELETE' });
