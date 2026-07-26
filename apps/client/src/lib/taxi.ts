import { apiFetch } from './api';

export interface Driver { userId: number; name: string; gradeName: string | null }
export interface VipType { id: number; name: string; fixedPrice: number; pricePerKm: number | null; active: boolean }
export interface TaxiConfig {
  canWrite: boolean;
  settings: { pricePerKm: number; pricePerClient: number };
  vipTypes: VipType[];
  drivers: Driver[];
}

export interface ListParams { driverId?: number; from?: string; to?: string; sort?: 'recent' | 'oldest' | 'amount'; page?: number; limit?: number }
function qs(p: ListParams = {}): string {
  const s = new URLSearchParams();
  if (p.driverId) s.set('driverId', String(p.driverId));
  if (p.from) s.set('from', p.from);
  if (p.to) s.set('to', p.to);
  if (p.sort) s.set('sort', p.sort);
  if (p.page) s.set('page', String(p.page));
  if (p.limit) s.set('limit', String(p.limit));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export interface Citoyen { id: number; driverUserId: number | null; driverName: string; km: number; pricePerKm: number; total: number; notes: string | null; createdAt: string }
export interface Concitoyen { id: number; driverUserId: number | null; driverName: string; clients: number; pricePerClient: number; total: number; notes: string | null; createdAt: string }
export interface Vip { id: number; driverUserId: number | null; driverName: string; typeId: number | null; typeName: string; km: number | null; total: number; notes: string | null; createdAt: string }

const base = (companyId: number) => `/api/me/companies/${companyId}/taxi`;

export const getTaxiConfig = (companyId: number) => apiFetch<TaxiConfig>(`${base(companyId)}/config`);
export const updateTaxiSettings = (companyId: number, body: { pricePerKm: number; pricePerClient: number }) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/settings`, { method: 'PUT', body: JSON.stringify(body) });
export const createVipType = (companyId: number, body: { name: string; fixedPrice: number; pricePerKm?: number | null }) =>
  apiFetch<{ ok: boolean; id: number }>(`${base(companyId)}/vip-types`, { method: 'POST', body: JSON.stringify(body) });
export const updateVipType = (companyId: number, id: number, body: Partial<{ name: string; fixedPrice: number; pricePerKm: number | null }>) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/vip-types/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteVipType = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/vip-types/${id}`, { method: 'DELETE' });

export const getCitoyens = (companyId: number, p?: ListParams) =>
  apiFetch<{ canWrite: boolean; total: number; page: number; limit: number; stats: { count: number; km: number; revenue: number }; rows: Citoyen[] }>(`${base(companyId)}/citoyens${qs(p)}`);
export const createCitoyen = (companyId: number, body: { driverUserId?: number | null; driverName?: string | null; km: number; notes?: string | null }) =>
  apiFetch<{ ok: boolean; id: number; total: number }>(`${base(companyId)}/citoyens`, { method: 'POST', body: JSON.stringify(body) });
export const updateCitoyen = (companyId: number, id: number, body: Partial<{ driverUserId: number | null; driverName: string | null; km: number; notes: string | null }>) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/citoyens/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteCitoyen = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/citoyens/${id}`, { method: 'DELETE' });

export const getConcitoyens = (companyId: number, p?: ListParams) =>
  apiFetch<{ canWrite: boolean; total: number; page: number; limit: number; stats: { count: number; clients: number; revenue: number }; rows: Concitoyen[] }>(`${base(companyId)}/concitoyens${qs(p)}`);
export const createConcitoyen = (companyId: number, body: { driverUserId?: number | null; driverName?: string | null; clients: number; notes?: string | null }) =>
  apiFetch<{ ok: boolean; id: number; total: number }>(`${base(companyId)}/concitoyens`, { method: 'POST', body: JSON.stringify(body) });
export const updateConcitoyen = (companyId: number, id: number, body: Partial<{ driverUserId: number | null; driverName: string | null; clients: number; notes: string | null }>) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/concitoyens/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteConcitoyen = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/concitoyens/${id}`, { method: 'DELETE' });

export const getVip = (companyId: number, p?: ListParams) =>
  apiFetch<{ canWrite: boolean; total: number; page: number; limit: number; stats: { count: number; revenue: number }; rows: Vip[] }>(`${base(companyId)}/vip${qs(p)}`);
export const createVip = (companyId: number, body: { driverUserId?: number | null; driverName?: string | null; typeId: number; km?: number | null; notes?: string | null }) =>
  apiFetch<{ ok: boolean; id: number; total: number }>(`${base(companyId)}/vip`, { method: 'POST', body: JSON.stringify(body) });
export const updateVip = (companyId: number, id: number, body: Partial<{ driverUserId: number | null; driverName: string | null; typeId: number; km: number | null; notes: string | null }>) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/vip/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteVip = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/vip/${id}`, { method: 'DELETE' });

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
  apiFetch<{ canWrite: boolean; rows: PersonnelRow[] }>(`${base(companyId)}/personnel`);
export const updatePersonnel = (companyId: number, employeeId: number, body: Partial<{ contractSigned: boolean; medicalVisit: boolean }>) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/personnel/${employeeId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const addWarning = (companyId: number, employeeId: number, reason: string) =>
  apiFetch<{ ok: boolean; id: number }>(`${base(companyId)}/personnel/${employeeId}/warnings`, { method: 'POST', body: JSON.stringify({ reason }) });
export const deleteWarning = (companyId: number, employeeId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/personnel/${employeeId}/warnings/${id}`, { method: 'DELETE' });

export interface Vehicle { id: number; plate: string; perf: boolean; assignedEmployeeId: number | null; assignedName: string | null; notes: string | null; createdAt: string }
export const getVehicles = (companyId: number) =>
  apiFetch<{ canWrite: boolean; employees: { id: number; name: string }[]; stats: { total: number; perf: number; assigned: number; available: number }; rows: Vehicle[] }>(`${base(companyId)}/vehicles`);
export const createVehicle = (companyId: number, body: { plate: string; perf?: boolean; assignedEmployeeId?: number | null; notes?: string | null }) =>
  apiFetch<{ ok: boolean; id: number }>(`${base(companyId)}/vehicles`, { method: 'POST', body: JSON.stringify(body) });
export const updateVehicle = (companyId: number, id: number, body: Partial<{ plate: string; perf: boolean; assignedEmployeeId: number | null; notes: string | null }>) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteVehicle = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/vehicles/${id}`, { method: 'DELETE' });
