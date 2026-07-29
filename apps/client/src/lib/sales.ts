import type { PaymentMethod, CatalogItemType } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface SaleListItem {
  id: number;
  subtotal: number;
  discount: number;
  total: number;
  productionCost: number;
  margin: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  createdAt: string;
  employeeName: string | null;
  clientName: string | null;
}

export interface SaleLine {
  id: number;
  name: string;
  itemType: CatalogItemType;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  productionCost: number;
}

export interface SaleDetail extends Omit<SaleListItem, 'margin'> {
  pointsAwarded: number;
  lines: SaleLine[];
}

export interface SaleLineInput {
  catalogItemId?: number;
  name?: string;
  unitPrice?: number;
  quantity: number;
}

export interface SaleInput {
  clientId?: number | null;
  employeeId?: number | null;
  paymentMethod: PaymentMethod;
  discount?: number;
  notes?: string;
  lines: SaleLineInput[];
}

export const getSaleVendeurs = (companyId: number) =>
  apiFetch<{ vendeurs: { id: number; name: string }[] }>(`/api/me/companies/${companyId}/sales/vendeurs`);

export const getSales = (companyId: number) =>
  apiFetch<{ canWrite: boolean; sales: SaleListItem[] }>(`/api/me/companies/${companyId}/sales`);

export const getSale = (companyId: number, id: number) =>
  apiFetch<SaleDetail>(`/api/me/companies/${companyId}/sales/${id}`);

export const createSale = (companyId: number, body: SaleInput) =>
  apiFetch<{ ok: boolean; id: number; insufficient: string[]; creditExceeded: boolean }>(
    `/api/me/companies/${companyId}/sales`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const deleteSale = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/sales/${id}`, { method: 'DELETE' });
