import { apiFetch } from './api';

export interface CargaisonParticipant {
  employeeId: number | null;
  name: string | null;
  share: number;
}
export interface CargaisonRow {
  id: number;
  clientName: string;
  blNumber: string;
  product: string;
  qty: number;
  total: number;
  importCost: number;
  employeeShare: number;
  companyShare: number;
  participantCount: number;
  participants: CargaisonParticipant[];
  note: string | null;
  authorName: string | null;
  createdAt: string;
}
export interface CargaisonData {
  canWrite: boolean;
  canManage: boolean;
  config: { companyPct: number };
  week: { offset: number; label: string; start: string; end: string };
  employees: { id: number; name: string }[];
  cargaisons: CargaisonRow[];
  summary: { totalRevenue: number; totalEmployee: number; totalCompany: number; count: number };
}

const base = (c: number) => `/api/me/companies/${c}/cargaison`;

export const getCargaisons = (c: number, offset = 0) => apiFetch<CargaisonData>(`${base(c)}?offset=${offset}`);

export const addCargaison = (
  c: number,
  body: { clientName: string; blNumber?: string; product?: string; qty: number; total: number; importCost?: number; participantIds: number[]; note?: string },
) =>
  apiFetch<{ ok: boolean; total: number; employeeShare: number; companyShare: number; sharePerEmployee: number }>(base(c), {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const deleteCargaison = (c: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(c)}/${id}`, { method: 'DELETE' });
