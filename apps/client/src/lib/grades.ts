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

// --- Patron-scoped (fine per-action) ---

export interface GradePermFine {
  canView: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface GradeFine {
  id: number;
  name: string;
  rank: number;
  isDefault: boolean;
  canManage: boolean;
  permissions: Record<string, GradePermFine>;
  special: Record<string, Record<string, boolean>>;
}

export interface GradesDataFine {
  modules: { key: ModuleKey; label: string; group: string }[];
  grades: GradeFine[];
}

export const getMyGrades = (companyId: number) =>
  apiFetch<GradesDataFine>(`/api/me/companies/${companyId}/grades`);

export const createMyGrade = (companyId: number, name: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/grades`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const patchMyGrade = (
  companyId: number,
  rid: number,
  body: { name?: string; canManage?: boolean },
) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/grades/${rid}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteMyGrade = (companyId: number, rid: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/grades/${rid}`, { method: 'DELETE' });

export const setMyGradePermission = (
  companyId: number,
  rid: number,
  key: ModuleKey,
  perm: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean },
) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/grades/${rid}/permissions/${key}`, {
    method: 'PUT',
    body: JSON.stringify(perm),
  });

export const setMyGradeSpecialPermission = (
  companyId: number,
  rid: number,
  moduleKey: string,
  actionKey: string,
  granted: boolean,
) =>
  apiFetch<{ ok: boolean }>(
    `/api/me/companies/${companyId}/grades/${rid}/special/${moduleKey}/${actionKey}`,
    { method: 'PUT', body: JSON.stringify({ granted }) },
  );

// --- Patron-scoped member assignment ---

export interface CompanyMember {
  membershipId: number;
  userId: number;
  discordId: string;
  displayName: string;
  avatarUrl: string | null;
  gradeId: number | null;
  gradeName: string | null;
  active: boolean;
}

export const getMyMembers = (companyId: number) =>
  apiFetch<CompanyMember[]>(`/api/me/companies/${companyId}/members`);

export const addMyMember = (
  companyId: number,
  body: { discordId: string; displayName: string; gradeId: number },
) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const setMyMemberGrade = (companyId: number, mid: number, gradeId: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/members/${mid}`, {
    method: 'PATCH',
    body: JSON.stringify({ gradeId }),
  });

export const removeMyMember = (companyId: number, mid: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/members/${mid}`, { method: 'DELETE' });
