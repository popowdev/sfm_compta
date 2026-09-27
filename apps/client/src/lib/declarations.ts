import { apiFetch } from './api';

export interface Declaration {
  id: number;
  companyId: number;
  weekLabel: string;
  weekStart: string | null;
  declarantName: string;
  caNet: number;
  charges: number;
  benefit: number;
  taxableBenefit: number | null;
  corporateTax: number;
  dividends: number;
  dividendTax: number;
  totalTax: number;
  status: 'submitted' | 'paid' | 'cancelled';
  email: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
  archivedAt: string | null;
  companyName?: string;
}

export interface SubmitDeclarationInput {
  weekStart: string;
  declarantName: string;
  caNet: number;
  charges: number;
  benefit: number;
  dividends: number;
  email?: string;
  notes?: string;
}

export const getMyDeclarations = (companyId: number) =>
  apiFetch<{ canWrite: boolean; declarations: Declaration[] }>(
    `/api/me/companies/${companyId}/declarations`,
  );

export const submitDeclaration = (companyId: number, body: SubmitDeclarationInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/declarations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export interface DeclarationPrefill {
  weekLabel: string;
  weekStart: string;
  caNet: number;
  expenses: number;
  payroll: number;
  charges: number;
  benefit: number;
  nonDeductible: number;
  dividends: number;
  source: 'exercice' | 'live';
}

export const getDeclarationPrefill = (companyId: number, offset = 0) =>
  apiFetch<DeclarationPrefill>(`/api/me/companies/${companyId}/declarations/prefill?offset=${offset}`);

export const getAllDeclarations = (archived = false) =>
  apiFetch<Declaration[]>(`/api/declarations${archived ? '?archived=1' : ''}`);

export const setDeclarationStatus = (id: number, status: 'submitted' | 'paid' | 'cancelled') =>
  apiFetch<{ ok: boolean }>(`/api/declarations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const archiveDeclaration = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/declarations/${id}`, { method: 'DELETE' });

export const restoreDeclaration = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/declarations/${id}/restore`, { method: 'POST' });

export const purgeDeclaration = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/declarations/${id}/purge`, { method: 'DELETE' });

export function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}
