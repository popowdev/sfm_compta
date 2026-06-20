import { apiFetch } from './api';

export interface Declaration {
  id: number;
  companyId: number;
  weekLabel: string;
  declarantName: string;
  caNet: number;
  charges: number;
  benefit: number;
  corporateTax: number;
  dividends: number;
  dividendTax: number;
  totalTax: number;
  status: 'submitted' | 'paid' | 'cancelled';
  email: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
  companyName?: string;
}

export interface SubmitDeclarationInput {
  weekLabel: string;
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
  caNet: number;
  expenses: number;
  payroll: number;
  charges: number;
  benefit: number;
}

export const getDeclarationPrefill = (companyId: number, offset = 0) =>
  apiFetch<DeclarationPrefill>(`/api/me/companies/${companyId}/declarations/prefill?offset=${offset}`);

export const getAllDeclarations = () => apiFetch<Declaration[]>('/api/declarations');

export const setDeclarationStatus = (id: number, status: 'submitted' | 'paid' | 'cancelled') =>
  apiFetch<{ ok: boolean }>(`/api/declarations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export function fmtMoney(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
