import { apiFetch } from './api';

export interface PublicShareholder {
  id: number;
  name: string;
  percentage: number;
  shareType: string;
  anonymous?: boolean;
  publicName?: string | null;
}

export interface ShareholderInput {
  name: string;
  percentage: number;
  shareType?: string;
  anonymous?: boolean;
  publicName?: string | null;
}

export const getMyShareholders = (companyId: number) =>
  apiFetch<{ valuation: number; canManage: boolean; shareholders: PublicShareholder[] }>(
    `/api/me/companies/${companyId}/shareholders`,
  );

export const createMyShareholder = (companyId: number, body: ShareholderInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/shareholders`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateMyShareholder = (companyId: number, sid: number, body: Partial<ShareholderInput>) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/shareholders/${sid}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteMyShareholder = (companyId: number, sid: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/shareholders/${sid}`, { method: 'DELETE' });

export const updateMyValuation = (companyId: number, valuation: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/shareholders/valuation`, {
    method: 'PATCH',
    body: JSON.stringify({ valuation }),
  });
