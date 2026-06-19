import type { ModuleKey } from '@rp-compta/shared';
import { apiFetch, ApiError } from './api';

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
  canManage: boolean;
  modules: MyModule[];
}

export const getMyCompanies = () => apiFetch<MyCompany[]>('/api/me/companies');

export const toggleMyModule = (companyId: number, key: ModuleKey, enabled: boolean) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/modules/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });

export async function uploadMyCompanyLogo(companyId: number, file: File): Promise<void> {
  const fd = new FormData();
  fd.append('logo', file);
  const res = await fetch(`/api/me/companies/${companyId}/logo`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status);
}
