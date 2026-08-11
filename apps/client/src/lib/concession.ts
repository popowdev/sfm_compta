import { apiFetch } from './api';

export type VehicleType = 'new' | 'used';

export interface ConcessionVehicle {
  id: number;
  name: string;
  category: string;
  type: VehicleType;
  purchasePrice: number;
  salePrice: number;
  imageUrl: string | null;
  description: string | null;
  available: boolean;
  showroom: boolean;
}
export interface ConcessionSummary {
  catalogSize: number;
  availableCount: number;
  catalogValue: number;
  salesCount: number;
  revenue: number;
  margin: number;
  commissionsPaid: number;
}
export interface ConcessionShowroom {
  enabled: boolean;
  token: string | null;
}
export interface ConcessionOverview {
  canWrite: boolean;
  vehicles: ConcessionVehicle[];
  summary: ConcessionSummary;
  showroom: ConcessionShowroom;
}
export interface ConcessionSale {
  id: number;
  vehicleId: number | null;
  vehicleName: string;
  clientName: string | null;
  plate: string | null;
  purchasePrice: number;
  salePrice: number;
  commission: number;
  margin: number;
  note: string | null;
  authorName: string | null;
  createdAt: string;
}

const base = (c: number) => `/api/me/companies/${c}/concession`;
const post = (url: string, body: unknown) => apiFetch<{ ok: boolean; commission?: number; token?: string }>(url, { method: 'POST', body: JSON.stringify(body) });
const patch = (url: string, body: unknown) => apiFetch<{ ok: boolean }>(url, { method: 'PATCH', body: JSON.stringify(body) });
const del = (url: string) => apiFetch<{ ok: boolean }>(url, { method: 'DELETE' });

export const getConcessionOverview = (c: number) => apiFetch<ConcessionOverview>(`${base(c)}/overview`);
export const getConcessionSales = (c: number) => apiFetch<{ canWrite: boolean; sales: ConcessionSale[] }>(`${base(c)}/sales`);

export interface VehicleInput {
  name: string;
  category?: string;
  type?: VehicleType;
  purchasePrice: number;
  salePrice: number;
  imageUrl?: string | null;
  description?: string | null;
  showroom?: boolean;
  available?: boolean;
}
export const addVehicle = (c: number, b: VehicleInput) => post(`${base(c)}/vehicles`, b);
export const updateVehicle = (c: number, id: number, b: Partial<VehicleInput>) => patch(`${base(c)}/vehicles/${id}`, b);
export const deleteVehicle = (c: number, id: number) => del(`${base(c)}/vehicles/${id}`);

export interface SaleInput {
  vehicleId?: number | null;
  vehicleName: string;
  clientName?: string;
  plate?: string;
  purchasePrice: number;
  salePrice: number;
  note?: string;
}
export const addSale = (c: number, b: SaleInput) => post(`${base(c)}/sales`, b);
export const deleteSale = (c: number, id: number) => del(`${base(c)}/sales/${id}`);
export const regenerateShowroomToken = (c: number) => post(`${base(c)}/showroom/regenerate`, {});

export interface ShowroomVehicle {
  id: number;
  name: string;
  category: string;
  type: VehicleType;
  salePrice: number;
  imageUrl: string | null;
  description: string | null;
}
export interface ShowroomData {
  company: { name: string; logoUrl: string | null };
  vehicles: ShowroomVehicle[];
}
export const getShowroom = (token: string) => apiFetch<ShowroomData>(`/api/showroom/${encodeURIComponent(token)}`);
