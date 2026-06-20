import type { StockUnit } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface CompanyDashboard {
  sales: {
    total: number;
    count: number;
    margin: number;
    byDay: { date: string; total: number }[];
    topProducts: { name: string; revenue: number }[];
  };
  stock: {
    totalValue: number;
    itemCount: number;
    lowCount: number;
    lowItems: { id: number; name: string; quantity: number; unit: StockUnit; threshold: number }[];
  };
  hr: { total: number; active: number };
  clients: { count: number; debt: number };
  openExercices: number;
}

export const getCompanyDashboard = (companyId: number) =>
  apiFetch<CompanyDashboard>(`/api/me/companies/${companyId}/dashboard`);
