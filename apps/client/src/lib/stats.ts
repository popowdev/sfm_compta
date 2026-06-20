import { apiFetch } from './api';

export interface CompanyStats {
  fiscal: {
    caNet: number;
    benefit: number;
    totalTax: number;
    dividends: number;
    count: number;
    weekly: { weekLabel: string; caNet: number; benefit: number; totalTax: number }[];
  };
  expenses: {
    total: number;
    deductible: number;
    count: number;
    byCategory: { category: string; total: number }[];
  };
  subventions: { requested: number; granted: number; count: number; pending: number };
  hr: {
    count: number;
    active: number;
    hourlyTotal: number;
    byPosition: { position: string; count: number }[];
  };
}

export const getCompanyStats = (companyId: number) =>
  apiFetch<CompanyStats>(`/api/me/companies/${companyId}/stats`);
