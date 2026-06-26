import { apiFetch } from './api';

export interface AuditEntry {
  id: number;
  actorName: string;
  action: string;
  targetType: string;
  targetLabel: string | null;
  detail: string | null;
  createdAt: string;
}

export const getAudit = () => apiFetch<{ entries: AuditEntry[] }>('/api/irs/audit');
