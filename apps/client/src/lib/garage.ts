import { apiFetch } from './api';

export interface GarageType { id: number; name: string; price: number; active: boolean }
export interface GaragePack { id: number; name: string; price: number; active: boolean }
export interface GarageSettings { depannagePerKm: number; depannageMultiplier: number; customMarginPct: number; commissionPct: number }
export interface GarageConfig { canWrite: boolean; canManage: boolean; settings: GarageSettings; types: GarageType[]; packs: GaragePack[] }
export interface GarageMember { userId: number; name: string; gradeName: string | null; commissionRate: number | null }
export interface GarageEarning { name: string; commission: number; revenue: number; count: number }
export interface GarageContractPrice { typeId: number | null; packId: number | null; price: number }
export interface GarageContract { id: number; companyId: number; name: string; description: string | null; active: boolean; prices: GarageContractPrice[] }
export interface ContractInput { name: string; description?: string; prices?: { typeId?: number | null; packId?: number | null; price: number }[] }
export interface GarageVehicle { id: number; ownerFirstName: string | null; ownerLastName: string | null; model: string | null; plate: string }
export interface GarageRepair {
  id: number; contractId: number | null; mechanicUserId: number | null; commissionAmount: number; mechanicName: string; clientName: string | null;
  plate: string | null; model: string | null; packName: string | null;
  items: { name: string; price: number }[] | null; depannageKm: number; total: number;
  description: string | null; paid: boolean; createdAt: string;
}
export interface GarageCustom {
  id: number; contractId: number | null; mechanicUserId: number | null; commissionAmount: number; mechanicName: string; clientName: string | null;
  plate: string | null; model: string | null; costPrice: number; discountPct: number;
  marginPct: number; finalPrice: number; profit: number; description: string | null; paid: boolean; createdAt: string;
}

const base = (c: number) => `/api/me/companies/${c}/garage`;
const post = (url: string, body: unknown) => apiFetch<{ ok: boolean }>(url, { method: 'POST', body: JSON.stringify(body) });
const patch = (url: string, body: unknown) => apiFetch<{ ok: boolean }>(url, { method: 'PATCH', body: JSON.stringify(body) });
const del = (url: string) => apiFetch<{ ok: boolean }>(url, { method: 'DELETE' });

export const getGarageConfig = (c: number) => apiFetch<GarageConfig>(`${base(c)}/config`);
export const getGarageMembers = (c: number) => apiFetch<{ members: GarageMember[] }>(`${base(c)}/members`);
export interface VehicleModel { id: number; name: string; manufacturer: string | null; category: string | null }
export const getGarageModels = (c: number, q = '') =>
  apiFetch<{ canWrite: boolean; canManageCatalog: boolean; models: VehicleModel[] }>(`${base(c)}/models${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const addGarageModel = (c: number, b: { name: string; manufacturer?: string; category?: string }) => post(`${base(c)}/models`, b);
export const updateGarageModel = (c: number, id: number, b: { name: string; manufacturer?: string; category?: string }) => patch(`${base(c)}/models/${id}`, b);
export const deleteGarageModel = (c: number, id: number) => del(`${base(c)}/models/${id}`);
export const getGarageEarnings = (c: number) => apiFetch<{ earnings: GarageEarning[] }>(`${base(c)}/earnings`);

export interface GarageBillingRow { paid: boolean; contractId: number; name: string; active: boolean; repairsCount: number; repairsTotal: number; customsCount: number; customsTotal: number; total: number }
export const getGarageBilling = (c: number, from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const qs = p.toString();
  return apiFetch<{ from: string; to: string; rows: GarageBillingRow[]; grandTotal: number; paidTotal: number }>(`${base(c)}/billing${qs ? `?${qs}` : ''}`);
};
export const saveGarageSettings = (c: number, b: GarageSettings) => apiFetch<{ ok: boolean }>(`${base(c)}/settings`, { method: 'PUT', body: JSON.stringify(b) });
export const addGarageType = (c: number, b: { name: string; price: number }) => post(`${base(c)}/types`, b);
export const updateGarageType = (c: number, id: number, b: { name?: string; price?: number }) => patch(`${base(c)}/types/${id}`, b);
export const deleteGarageType = (c: number, id: number) => del(`${base(c)}/types/${id}`);
export const addGaragePack = (c: number, b: { name: string; price: number }) => post(`${base(c)}/packs`, b);
export const deleteGaragePack = (c: number, id: number) => del(`${base(c)}/packs/${id}`);

export const getGarageContracts = (c: number) => apiFetch<{ canWrite: boolean; contracts: GarageContract[] }>(`${base(c)}/contracts`);
export const addGarageContract = (c: number, b: ContractInput) => post(`${base(c)}/contracts`, b);
export const updateGarageContract = (c: number, id: number, b: ContractInput) => patch(`${base(c)}/contracts/${id}`, b);
export const deleteGarageContract = (c: number, id: number) => del(`${base(c)}/contracts/${id}`);

export const getGarageVehicles = (c: number, q = '') =>
  apiFetch<{ canWrite: boolean; vehicles: GarageVehicle[] }>(`${base(c)}/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const addGarageVehicle = (c: number, b: { ownerFirstName?: string; ownerLastName?: string; model?: string; plate: string }) => post(`${base(c)}/vehicles`, b);
export const updateGarageVehicle = (c: number, id: number, b: { ownerFirstName?: string; ownerLastName?: string; model?: string; plate: string }) => patch(`${base(c)}/vehicles/${id}`, b);
export const deleteGarageVehicle = (c: number, id: number) => del(`${base(c)}/vehicles/${id}`);

export const getGarageRepairs = (c: number) => apiFetch<{ canWrite: boolean; repairs: GarageRepair[] }>(`${base(c)}/repairs`);
export const addGarageRepair = (c: number, b: unknown) => post(`${base(c)}/repairs`, b);
export const setRepairPaid = (c: number, id: number, paid: boolean) => patch(`${base(c)}/repairs/${id}`, { paid });
export const deleteGarageRepair = (c: number, id: number) => del(`${base(c)}/repairs/${id}`);

export const getGarageCustoms = (c: number) => apiFetch<{ canWrite: boolean; customs: GarageCustom[] }>(`${base(c)}/customs`);
export const addGarageCustom = (c: number, b: unknown) => post(`${base(c)}/customs`, b);
export const setCustomPaid = (c: number, id: number, paid: boolean) => patch(`${base(c)}/customs/${id}`, { paid });
export const deleteGarageCustom = (c: number, id: number) => del(`${base(c)}/customs/${id}`);

export const setGarageContractPaid = (c: number, contractId: number, from: string, paid: boolean) =>
  apiFetch<{ ok: boolean }>(`${base(c)}/billing/${contractId}/paid`, {
    method: 'PUT',
    body: JSON.stringify({ from, paid }),
  });
