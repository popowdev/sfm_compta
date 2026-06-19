import type { ModuleKey } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface Company {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  fivemJob: string | null;
  active: boolean;
}

export interface ModuleState {
  key: ModuleKey;
  label: string;
  group: string;
  enabled: boolean;
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
