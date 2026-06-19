import type { ModuleKey } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface MyModule {
  key: ModuleKey;
  label: string;
  group: string;
  enabled: boolean;
  blocked: boolean;
  canView: boolean;
  canWrite: boolean;
}

export interface MyCompany {
  company: { id: number; name: string; slug: string; logoUrl: string | null };
  grade: { id: number; name: string } | null;
  modules: MyModule[];
}

export const getMyCompanies = () => apiFetch<MyCompany[]>('/api/me/companies');
