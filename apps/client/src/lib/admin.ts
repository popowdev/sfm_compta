import { apiFetch } from './api';

export interface AdminUserCompany {
  name: string;
  grade: string | null;
}
export interface AdminUserCharacter {
  name: string;
  job: string | null;
  grade: number;
  gradeLabel: string | null;
  unemployed: boolean;
  selected: boolean;
}
export interface AdminUser {
  id: number;
  discordId: string;
  displayName: string;
  avatarUrl: string | null;
  whitelisted: boolean;
  roles: string[];
  companies: AdminUserCompany[];
  characters: AdminUserCharacter[];
  createdAt: string;
}

export interface AdminUsersParams {
  page?: number;
  limit?: number;
  q?: string;
  role?: string;
  whitelisted?: string;
}

export const getAdminUsers = (params: AdminUsersParams = {}) => {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.q) sp.set('q', params.q);
  if (params.role) sp.set('role', params.role);
  if (params.whitelisted) sp.set('whitelisted', params.whitelisted);
  const qs = sp.toString();
  return apiFetch<{ users: AdminUser[]; total: number; page: number; limit: number }>(
    `/api/admin/users${qs ? `?${qs}` : ''}`,
  );
};

export const resyncFivemUser = (id: number) =>
  apiFetch<{ ok: boolean; count: number }>(`/api/admin/users/${id}/fivem-resync`, { method: 'POST' });

export const setUserIrs = (id: number, grant: boolean) =>
  apiFetch<{ ok: boolean }>(`/api/admin/users/${id}/irs`, {
    method: 'PUT',
    body: JSON.stringify({ grant }),
  });

export const setUserWhitelist = (id: number, whitelisted: boolean) =>
  apiFetch<{ ok: boolean }>(`/api/admin/users/${id}/whitelist`, {
    method: 'PATCH',
    body: JSON.stringify({ whitelisted }),
  });

export const deleteAdminUser = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' });
