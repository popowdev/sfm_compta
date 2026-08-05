import { apiFetch } from './api';

export interface RunRow {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  qty: number;
  unitPrice: number;
  total: number;
  commission: number;
  note: string | null;
  authorName: string | null;
  createdAt: string;
}
export interface RunsData {
  canWrite: boolean;
  canManage: boolean;
  config: { unitPrice: number; commissionPct: number };
  week: { offset: number; label: string; start: string; end: string };
  employees: { id: number; name: string }[];
  runs: RunRow[];
  summary: { totalRuns: number; totalRevenue: number; totalCommission: number; companyShare: number; count: number };
}

const base = (c: number) => `/api/me/companies/${c}/runs`;

export const getRuns = (c: number, offset = 0) => apiFetch<RunsData>(`${base(c)}?offset=${offset}`);
export const addRun = (c: number, body: { employeeId?: number; qty: number; note?: string }) =>
  apiFetch<{ ok: boolean; total: number; commission: number }>(base(c), { method: 'POST', body: JSON.stringify(body) });
export const deleteRun = (c: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(c)}/${id}`, { method: 'DELETE' });
