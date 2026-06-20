import { apiFetch } from './api';

export interface AdminUser {
  id: number;
  discordId: string;
  displayName: string;
  avatarUrl: string | null;
  whitelisted: boolean;
  roles: string[];
  companies: string[];
  createdAt: string;
}

export const getAdminUsers = () => apiFetch<{ users: AdminUser[] }>('/api/admin/users');

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
