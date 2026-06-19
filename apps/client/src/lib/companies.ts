import type { ModuleKey } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface Company {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  fivemJob: string | null;
  valuation: string;
  active: boolean;
}

export interface Shareholder {
  id: number;
  name: string;
  percentage: number;
  shareType: string;
  anonymous: boolean;
  publicName: string | null;
}

export interface ShareholderInput {
  name: string;
  percentage: number;
  shareType?: string;
  anonymous?: boolean;
  publicName?: string | null;
}

export interface ModuleState {
  key: ModuleKey;
  label: string;
  group: string;
  enabled: boolean;
  blocked: boolean;
  config: unknown | null;
}

export const getCompanies = () => apiFetch<Company[]>('/api/companies');

export const createCompany = (body: { name: string; fivemJob?: string }) =>
  apiFetch<Company>('/api/companies', { method: 'POST', body: JSON.stringify(body) });

export const getCompanyModules = (id: number) =>
  apiFetch<ModuleState[]>(`/api/companies/${id}/modules`);

export const toggleModule = (id: number, key: ModuleKey, enabled: boolean) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${id}/modules/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });

export const updateCompany = (id: number, body: Partial<{ valuation: number; active: boolean }>) =>
  apiFetch<Company>(`/api/companies/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const getShareholders = (companyId: number) =>
  apiFetch<Shareholder[]>(`/api/companies/${companyId}/shareholders`);

export const addShareholder = (companyId: number, body: ShareholderInput) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/shareholders`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const deleteShareholder = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/shareholders/${id}`, { method: 'DELETE' });
