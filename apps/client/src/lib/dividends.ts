import { apiFetch } from './api';

export type DividendStatus = 'pending' | 'paid' | 'cancelled';

export interface DividendPayout {
  id: number;
  reference: string;
  companyId: number;
  companyName: string | null;
  shareholderName: string;
  rib: string | null;
  gross: number;
  taxRate: number;
  tax: number;
  net: number;
  status: DividendStatus;
  transferValidated: boolean;
  notes: string | null;
  declaredBy: string | null;
  createdAt: string;
}

export interface DividendInput {
  shareholderName: string;
  rib: string;
  gross: number;
  notes?: string;
}

export const getDividends = (companyId: number) =>
  apiFetch<{ canWrite: boolean; dividendTaxRate: number; payouts: DividendPayout[] }>(
    `/api/me/companies/${companyId}/dividends`,
  );

export const createDividend = (companyId: number, body: DividendInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/dividends`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const deleteDividend = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/dividends/${id}`, { method: 'DELETE' });

export const getIrsDividends = (companyId?: number) =>
  apiFetch<{ payouts: DividendPayout[] }>(
    `/api/dividends${companyId ? `?companyId=${companyId}` : ''}`,
  );

export const decideDividend = (id: number, body: { status?: DividendStatus; transferValidated?: boolean }) =>
  apiFetch<{ ok: boolean }>(`/api/dividends/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
