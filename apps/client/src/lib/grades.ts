import type { ModuleKey } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface GradePermission {
  canView: boolean;
  canWrite: boolean;
}

export interface Grade {
  id: number;
  name: string;
  rank: number;
  isDefault: boolean;
  permissions: Record<string, GradePermission>;
}

export interface GradesData {
  modules: { key: ModuleKey; label: string; group: string }[];
  grades: Grade[];
}

export const getGrades = (companyId: number) =>
  apiFetch<GradesData>(`/api/companies/${companyId}/roles`);

export const createGrade = (companyId: number, name: string) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const deleteGrade = (companyId: number, rid: number) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/roles/${rid}`, { method: 'DELETE' });

export const setGradePermission = (
  companyId: number,
  rid: number,
  key: ModuleKey,
  canView: boolean,
  canWrite: boolean,
) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/roles/${rid}/permissions/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ canView, canWrite }),
  });
