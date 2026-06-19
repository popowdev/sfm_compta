import { apiFetch } from './api';

export type SubventionStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface Subvention {
  id: number;
  companyId: number;
  motif: string;
  requesterName: string;
  amountRequested: number;
  amountGranted: number | null;
  status: SubventionStatus;
  notes: string | null;
  decidedAt: string | null;
  createdAt: string;
  companyName?: string;
}

export interface SubventionRequestInput {
  motif: string;
  requesterName: string;
  amountRequested: number;
  notes?: string;
}

export const getMySubventions = (companyId: number) =>
  apiFetch<{ canWrite: boolean; subventions: Subvention[] }>(
    `/api/me/companies/${companyId}/subventions`,
  );

export const requestSubvention = (companyId: number, body: SubventionRequestInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/subventions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getAllSubventions = () => apiFetch<Subvention[]>('/api/subventions');

export const decideSubvention = (
  id: number,
  body: { status: SubventionStatus; amountGranted?: number | null },
) =>
  apiFetch<{ ok: boolean }>(`/api/subventions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
