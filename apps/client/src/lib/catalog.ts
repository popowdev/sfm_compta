import type { CatalogItemType, StockUnit } from '@rp-compta/shared';
import { apiFetch } from './api';

export interface RecipeLine {
  stockItemId: number;
  stockName: string;
  unit: StockUnit | null;
  quantity: number;
  unitCost: number | null;
  lineCost: number | null;
}

export interface CatalogItem {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  type: CatalogItemType;
  price: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  recipe: RecipeLine[];
  productionCost: number | null;
  margin: number | null;
}

export interface CatalogStock {
  id: number;
  name: string;
  unit: StockUnit;
  unitCost: number;
  quantity: number;
}

export interface CatalogItemInput {
  name: string;
  categoryId?: number | null;
  type: CatalogItemType;
  price: number;
  active?: boolean;
  notes?: string;
}

export interface RecipeInput {
  lines: { stockItemId: number; quantity: number }[];
}

export const getCatalog = (companyId: number) =>
  apiFetch<{
    canWrite: boolean;
    stocksVisible: boolean;
    items: CatalogItem[];
    stockItems: CatalogStock[];
  }>(`/api/me/companies/${companyId}/catalog`);

export const createCatalogItem = (companyId: number, body: CatalogItemInput) =>
  apiFetch<{ ok: boolean; id: number }>(`/api/me/companies/${companyId}/catalog`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateCatalogItem = (companyId: number, id: number, body: CatalogItemInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/catalog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteCatalogItem = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/catalog/${id}`, { method: 'DELETE' });

export const setCatalogRecipe = (companyId: number, id: number, body: RecipeInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/catalog/${id}/recipe`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
