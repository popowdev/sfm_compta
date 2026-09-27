import type { ImmoRentalStatus, ImmoSaleStatus } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface ListParams {
  q?: string;
  tenant?: string;
  status?: string;
  agent?: string;
  page?: number;
  limit?: number;
}
function qs(p: ListParams = {}): string {
  const s = new URLSearchParams();
  if (p.q) s.set('q', p.q);
  if (p.tenant) s.set('tenant', p.tenant);
  if (p.status) s.set('status', p.status);
  if (p.agent) s.set('agent', p.agent);
  if (p.page) s.set('page', String(p.page));
  if (p.limit) s.set('limit', String(p.limit));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export interface PricingDetail {
  typeKey: string | null;
  basePrice: number;
  options: string[];
  roleDiscounts: string[];
  reduction: number;
  reductionType: 'amount' | 'percent';
  frais: number;
  fraisType: 'amount' | 'percent';
  finalPrice: number;
}

export interface Rental {
  id: number;
  propertyRef: string;
  clientId: number | null;
  tenant: string | null;
  agent: string | null;
  weeklyRent: number;
  startDate: string | null;
  status: ImmoRentalStatus;
  autoGenerate: boolean;
  reminderEnabled: boolean;
  tenantDiscordId: string | null;
  notes: string | null;
  pricingDetail: PricingDetail | null;
  createdAt: string;
  unpaidCount: number;
  onMap: boolean;
}
export interface RentalStats {
  total: number;
  active: number;
  unpaidInvoices: number;
}
export interface RentInvoice {
  id: number;
  weekStart: string;
  amount: number;
  status: 'paye' | 'impaye';
  paidAt: string | null;
}
export interface RentalInput {
  propertyRef: string;
  tenantName?: string | null;
  agent?: string | null;
  weeklyRent: number;
  startDate?: string | null;
  status?: ImmoRentalStatus;
  autoGenerate?: boolean;
  reminderEnabled?: boolean;
  tenantDiscordId?: string | null;
  notes?: string | null;
  pricingDetail?: PricingDetail | null;
}

export const getRentals = (companyId: number, params?: ListParams) =>
  apiFetch<{ canWrite: boolean; total: number; page: number; limit: number; stats: RentalStats; rentals: Rental[] }>(
    `/api/me/companies/${companyId}/immo-rentals${qs(params)}`,
  );
export const createRental = (companyId: number, body: RentalInput) =>
  apiFetch<{ ok: boolean; id: number }>(`/api/me/companies/${companyId}/immo-rentals`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateRental = (companyId: number, id: number, body: Partial<RentalInput>) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-rentals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteRental = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-rentals/${id}`, { method: 'DELETE' });

export interface InvoiceSummary {
  paidCount: number;
  unpaidCount: number;
  totalPaid: number;
  totalUnpaid: number;
  lastPayment: { weekStart: string; amount: number; paidAt: string | null } | null;
}
export const getRentInvoices = (companyId: number, rentalId: number) =>
  apiFetch<{ canWrite: boolean; summary: InvoiceSummary; invoices: RentInvoice[] }>(
    `/api/me/companies/${companyId}/immo-rentals/${rentalId}/invoices`,
  );
export const generateRentInvoice = (companyId: number, rentalId: number, weekStart: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-rentals/${rentalId}/invoices`, {
    method: 'POST',
    body: JSON.stringify({ weekStart }),
  });
export const setRentInvoiceStatus = (companyId: number, invoiceId: number, status: 'paye' | 'impaye') =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-rentals/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export interface UnpaidInvoice {
  id: number;
  rentalId: number;
  weekStart: string;
  amount: number;
  propertyRef: string;
  tenant: string | null;
}
export const getUnpaidInvoices = (companyId: number) =>
  apiFetch<{ canWrite: boolean; invoices: UnpaidInvoice[] }>(
    `/api/me/companies/${companyId}/immo-rentals/unpaid`,
  );

export interface Sale {
  id: number;
  propertyRef: string;
  clientId: number | null;
  buyer: string | null;
  agent: string | null;
  price: number;
  status: ImmoSaleStatus;
  saleDate: string | null;
  notes: string | null;
  pricingDetail: PricingDetail | null;
  createdAt: string;
  onMap: boolean;
}
export interface SaleStats {
  total: number;
  sold: number;
  revenue: number;
}
export interface SaleInput {
  propertyRef: string;
  buyerName?: string | null;
  agent?: string | null;
  price: number;
  saleDate?: string | null;
  status?: ImmoSaleStatus;
  notes?: string | null;
  pricingDetail?: PricingDetail | null;
}

export const getSales = (companyId: number, params?: ListParams) =>
  apiFetch<{ canWrite: boolean; total: number; page: number; limit: number; stats: SaleStats; sales: Sale[] }>(
    `/api/me/companies/${companyId}/immo-sales${qs(params)}`,
  );
export const createSale = (companyId: number, body: SaleInput) =>
  apiFetch<{ ok: boolean; id: number }>(`/api/me/companies/${companyId}/immo-sales`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateSale = (companyId: number, id: number, body: Partial<SaleInput>) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-sales/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteSale = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-sales/${id}`, { method: 'DELETE' });

export type ParcelStatus = 'disponible' | 'vendu' | 'active';
export interface ParcelGeometry {
  type: 'polygon' | 'rectangle' | 'marker';
  coords: [number, number][];
}
export interface ParcelLink {
  kind: 'location' | 'vente';
  id: number;
}
export interface Parcel {
  id: number;
  propertyRef: string;
  status: ParcelStatus;
  price: number;
  ownerName: string | null;
  notes: string | null;
  geometry: ParcelGeometry;
  link: ParcelLink | null;
}
export interface ParcelInput {
  propertyRef: string;
  status?: ParcelStatus;
  price?: number;
  ownerName?: string | null;
  notes?: string | null;
  geometry: ParcelGeometry;
}

export const getParcels = (companyId: number) =>
  apiFetch<{ canWrite: boolean; parcels: Parcel[] }>(`/api/me/companies/${companyId}/immo-parcels`);
export const createParcel = (companyId: number, body: ParcelInput) =>
  apiFetch<{ ok: boolean; id: number }>(`/api/me/companies/${companyId}/immo-parcels`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateParcel = (companyId: number, id: number, body: Partial<ParcelInput>) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-parcels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteParcel = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/immo-parcels/${id}`, { method: 'DELETE' });
