import { apiFetch } from './api';

export interface StockCategory {
  id: number;
  name: string;
}

export const getStockCategories = (companyId: number) =>
  apiFetch<{ canWrite: boolean; categories: StockCategory[] }>(
    `/api/me/companies/${companyId}/stock-categories`,
  );

export const createStockCategory = (companyId: number, name: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stock-categories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const updateStockCategory = (companyId: number, id: number, name: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stock-categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });

export const deleteStockCategory = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stock-categories/${id}`, {
    method: 'DELETE',
  });
