import type { StockUnit, StockMovementType } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface StockItem {
  id: number;
  companyId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  unit: StockUnit;
  quantity: number;
  unitCost: number;
  lowStockThreshold: number;
  notes: string | null;
  createdAt: string;
}

export interface StockItemInput {
  name: string;
  categoryId?: number | null;
  unit: StockUnit;
  quantity: number;
  unitCost: number;
  lowStockThreshold: number;
  notes?: string;
}

export interface StockMovement {
  id: number;
  type: StockMovementType;
  quantity: number;
  unitCost: number | null;
  supplier: string | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface StockMovementInput {
  type: StockMovementType;
  quantity: number;
  unitCost?: number;
  supplier?: string;
  reason?: string;
}

export const getStocks = (companyId: number) =>
  apiFetch<{ canWrite: boolean; items: StockItem[] }>(`/api/me/companies/${companyId}/stocks`);

export const createStock = (companyId: number, body: StockItemInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stocks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateStock = (companyId: number, id: number, body: StockItemInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stocks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteStock = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stocks/${id}`, { method: 'DELETE' });

export const getStockMovements = (companyId: number, id: number) =>
  apiFetch<StockMovement[]>(`/api/me/companies/${companyId}/stocks/${id}/movements`);

export const addStockMovement = (companyId: number, id: number, body: StockMovementInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/stocks/${id}/movements`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
