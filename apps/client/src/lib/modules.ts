import type { EffectiveModule, ModuleKey } from '@rp-compta/shared';
import { apiFetch } from './api';

export const getAdminModules = () => apiFetch<EffectiveModule[]>('/api/admin/modules');

export const updateModule = (
  key: ModuleKey,
  patch: { label?: string; group?: string; blocked?: boolean },
) =>
  apiFetch<{ ok: boolean }>(`/api/admin/modules/${key}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
