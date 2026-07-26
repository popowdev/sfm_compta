import { apiFetch, ApiError } from './api';
import type { AssociationMemberRole, AssociationPartyType } from '@rp-compta/shared';
import type { DocItem } from './documents';

export type AssociationTxDirection = 'in' | 'out';

export type AssociationStatus = 'active' | 'dissolved';

export interface AssociationBase {
  id: number;
  name: string;
  slug: string;
  objet: string | null;
  logoUrl: string | null;
  status: AssociationStatus;
  createdAt: string;
}

export interface AssociationListItem extends AssociationBase {
  role: AssociationMemberRole | null;
  isStaff?: boolean;
  balance: number;
  memberCount: number;
}

export interface AssociationAccess {
  isStaff: boolean;
  role: AssociationMemberRole | null;
  canView: boolean;
  canManageMembers: boolean;
  canManageTreasury: boolean;
  canManageSettings: boolean;
}

export interface AssociationTx {
  id: number;
  direction: AssociationTxDirection;
  partyType: AssociationPartyType | null;
  fromName: string | null;
  toName: string | null;
  label: string;
  amount: number;
  createdByName?: string | null;
  createdAt: string;
}

export interface AssociationTxInput {
  direction: AssociationTxDirection;
  partyType: AssociationPartyType;
  fromName?: string;
  toName?: string;
  label: string;
  amount: number;
}

export interface AssociationDetail {
  association: AssociationBase;
  access: AssociationAccess;
  balance: number;
  memberCount: number;
  recent: AssociationTx[];
}

export interface AssociationMember {
  id: number;
  userId: number;
  role: AssociationMemberRole;
  active: boolean;
  name: string;
  discordId: string;
  createdAt: string;
}

async function multipart(url: string, fields: Record<string, string>, fileField: string, file: File): Promise<void> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v) fd.append(k, v);
  fd.append(fileField, file);
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, b?.error ?? null);
  }
}

// member-facing
export const getMyAssociations = () => apiFetch<AssociationListItem[]>('/api/me/associations');
export const getAssociation = (slug: string) => apiFetch<AssociationDetail>(`/api/me/associations/${slug}`);

export const getAssociationMembers = (id: number) =>
  apiFetch<{ canManage: boolean; members: AssociationMember[] }>(`/api/me/associations/${id}/members`);
export const addAssociationMember = (id: number, body: { discordId: string; displayName?: string; role: AssociationMemberRole }) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/members`, { method: 'POST', body: JSON.stringify(body) });
export const updateAssociationMember = (id: number, mid: number, role: AssociationMemberRole) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/members/${mid}`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const removeAssociationMember = (id: number, mid: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/members/${mid}`, { method: 'DELETE' });

export const getAssociationTransactions = (id: number) =>
  apiFetch<{ canManage: boolean; balance: number; transactions: AssociationTx[] }>(`/api/me/associations/${id}/transactions`);
export const addAssociationTransaction = (id: number, body: AssociationTxInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/transactions`, { method: 'POST', body: JSON.stringify(body) });
export const deleteAssociationTransaction = (id: number, tid: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/transactions/${tid}`, { method: 'DELETE' });

export const getAssociationDocuments = (id: number) =>
  apiFetch<{ canWrite: boolean; documents: DocItem[] }>(`/api/me/associations/${id}/documents`);
export const uploadAssociationDocument = (id: number, file: File, name: string, folder?: string) =>
  multipart(`/api/me/associations/${id}/documents`, { name, folder: folder ?? '' }, 'file', file);
export const deleteAssociationDocument = (id: number, did: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/documents/${did}`, { method: 'DELETE' });

export const uploadAssociationLogo = (id: number, file: File) =>
  multipart(`/api/me/associations/${id}/logo`, {}, 'logo', file);
export const updateAssociationObjet = (id: number, objet: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/associations/${id}/objet`, { method: 'PATCH', body: JSON.stringify({ objet }) });

// IRS registry
export const getAllAssociations = () =>
  apiFetch<(AssociationBase & { balance: number; memberCount: number })[]>('/api/associations');
export const createAssociation = (body: { name: string; objet?: string }) =>
  apiFetch<{ ok: boolean; id: number; slug: string }>('/api/associations', { method: 'POST', body: JSON.stringify(body) });
export const updateAssociation = (id: number, body: { name?: string; objet?: string | null; status?: AssociationStatus }) =>
  apiFetch<{ ok: boolean }>(`/api/associations/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteAssociation = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/associations/${id}`, { method: 'DELETE' });
