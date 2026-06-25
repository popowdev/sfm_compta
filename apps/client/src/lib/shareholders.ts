import { apiFetch } from './api';

export interface PublicShareholder {
  id: number;
  name: string;
  percentage: number;
  shareType: string;
}

export const getMyShareholders = (companyId: number) =>
  apiFetch<{ valuation: number; shareholders: PublicShareholder[] }>(
    `/api/me/companies/${companyId}/shareholders`,
  );
