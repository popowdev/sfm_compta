import { apiFetch } from './api';

export interface Member {
  membershipId: number;
  userId: number;
  discordId: string;
  displayName: string;
  avatarUrl: string | null;
  gradeId: number | null;
  gradeName: string | null;
  active: boolean;
}

export const getMembers = (companyId: number) =>
  apiFetch<Member[]>(`/api/companies/${companyId}/members`);

export const addMember = (
  companyId: number,
  body: { discordId: string; displayName: string; gradeId: number },
) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const setMemberGrade = (companyId: number, mid: number, gradeId: number) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/members/${mid}`, {
    method: 'PATCH',
    body: JSON.stringify({ gradeId }),
  });

export const removeMember = (companyId: number, mid: number) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/members/${mid}`, { method: 'DELETE' });
