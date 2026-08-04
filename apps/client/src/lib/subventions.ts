import { apiFetch, ApiError } from './api';
import type { SubventionType } from '@rp-compta/shared';

export type SubventionStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface SubventionDoc {
  id: number;
  url: string;
  name: string;
}

export interface Subvention {
  id: number;
  companyId: number;
  motif: string;
  type: SubventionType;
  requesterName: string;
  rib: string | null;
  amountRequested: number;
  amountGranted: number | null;
  status: SubventionStatus;
  photoUrl: string | null;
  documents: SubventionDoc[];
  notes: string | null;
  decidedAt: string | null;
  createdAt: string;
  companyName?: string;
}

export interface SubventionRequestInput {
  motif: string;
  type: SubventionType;
  requesterName: string;
  rib: string;
  amountRequested: number;
  notes?: string;
  photo: File;
  documents: File[];
}

export const getMySubventions = (companyId: number) =>
  apiFetch<{ canWrite: boolean; subventions: Subvention[] }>(
    `/api/me/companies/${companyId}/subventions`,
  );

export async function requestSubvention(companyId: number, body: SubventionRequestInput): Promise<void> {
  const fd = new FormData();
  fd.append('motif', body.motif);
  fd.append('type', body.type);
  fd.append('requesterName', body.requesterName);
  fd.append('rib', body.rib);
  fd.append('amountRequested', String(body.amountRequested));
  if (body.notes) fd.append('notes', body.notes);
  fd.append('photo', body.photo);
  for (const doc of body.documents) fd.append('documents', doc);
  const res = await fetch(`/api/me/companies/${companyId}/subventions`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, b?.error ?? null);
  }
}

export const getAllSubventions = () => apiFetch<Subvention[]>('/api/subventions');

export const decideSubvention = (
  id: number,
  body: { status: SubventionStatus; amountGranted?: number | null },
) =>
  apiFetch<{ ok: boolean }>(`/api/subventions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteSubvention = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/subventions/${id}`, { method: 'DELETE' });
