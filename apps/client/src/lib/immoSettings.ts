import { apiFetch } from './api';

export interface ImmoPriceType { id: number; key: string; label: string; basePrice: number }
export interface ImmoOption { id: number; name: string; pct: number }
export interface ImmoSettings {
  canWrite: boolean;
  locationTypes: ImmoPriceType[];
  venteTypes: ImmoPriceType[];
  locationOptions: ImmoOption[];
  venteOptions: ImmoOption[];
  discounts: ImmoOption[];
}

const base = (companyId: number) => `/api/me/companies/${companyId}/immo-settings`;

export const getImmoSettings = (companyId: number) => apiFetch<ImmoSettings>(base(companyId));

export const saveImmoPriceTypes = (companyId: number, kind: 'location' | 'vente', items: { key: string; label: string; basePrice: number }[]) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/price-types/${kind}`, { method: 'PUT', body: JSON.stringify({ items }) });

export const saveImmoOptions = (companyId: number, kind: 'location' | 'vente', items: { name: string; pct: number }[]) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/options/${kind}`, { method: 'PUT', body: JSON.stringify({ items }) });

export const saveImmoDiscounts = (companyId: number, items: { name: string; pct: number }[]) =>
  apiFetch<{ ok: boolean }>(`${base(companyId)}/discounts`, { method: 'PUT', body: JSON.stringify({ items }) });
