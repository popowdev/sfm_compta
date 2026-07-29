import { apiFetch } from './api';

export interface PawnItem {
  id: number;
  name: string;
  buyPrice: number;
  sellPrice: number;
  venteClient: boolean;
  active: boolean;
  stock: number;
  stockValue: number;
}
export interface PawnSummary {
  totalBuy: number;
  totalSell: number;
  margin: number;
  buyCount: number;
  sellCount: number;
  stockValue: number;
  stockUnits: number;
  itemsInStock: number;
}
export interface PawnOverview {
  canWrite: boolean;
  items: PawnItem[];
  summary: PawnSummary;
}
export interface PawnTx {
  id: number;
  itemId: number;
  itemName: string | null;
  type: 'buy' | 'sell';
  qty: number;
  unitPrice: number;
  total: number;
  clientName: string | null;
  note: string | null;
  authorName: string | null;
  createdAt: string;
}

const base = (c: number) => `/api/me/companies/${c}/pawnshop`;
const post = (url: string, body: unknown) => apiFetch<{ ok: boolean; total?: number }>(url, { method: 'POST', body: JSON.stringify(body) });
const patch = (url: string, body: unknown) => apiFetch<{ ok: boolean }>(url, { method: 'PATCH', body: JSON.stringify(body) });
const del = (url: string) => apiFetch<{ ok: boolean }>(url, { method: 'DELETE' });

export const getPawnOverview = (c: number) => apiFetch<PawnOverview>(`${base(c)}/overview`);
export const getPawnTransactions = (c: number, type?: 'buy' | 'sell') =>
  apiFetch<{ canWrite: boolean; transactions: PawnTx[] }>(`${base(c)}/transactions${type ? `?type=${type}` : ''}`);

export interface PawnItemInput { name: string; buyPrice: number; sellPrice: number; venteClient: boolean }
export const addPawnItem = (c: number, b: PawnItemInput) => post(`${base(c)}/items`, b);
export const updatePawnItem = (c: number, id: number, b: Partial<PawnItemInput> & { active?: boolean }) => patch(`${base(c)}/items/${id}`, b);
export const deletePawnItem = (c: number, id: number) => del(`${base(c)}/items/${id}`);

export interface PawnTxInput { itemId: number; qty: number; unitPrice: number; clientName?: string; note?: string }
export const addPawnBuy = (c: number, b: PawnTxInput) => post(`${base(c)}/buys`, b);
export const addPawnSell = (c: number, b: PawnTxInput) => post(`${base(c)}/sells`, b);
export const deletePawnTx = (c: number, id: number) => del(`${base(c)}/transactions/${id}`);
