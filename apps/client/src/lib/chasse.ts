import { apiFetch } from './api';

export interface ChasseItem {
  id: number;
  name: string;
  buyPrice: number;
  sellPrice: number;
  venteClient: boolean;
  active: boolean;
  stock: number;
  stockValue: number;
}
export interface ChasseSummary {
  totalBuy: number;
  totalSell: number;
  margin: number;
  buyCount: number;
  sellCount: number;
  stockValue: number;
  stockUnits: number;
  itemsInStock: number;
}
export interface ChasseOverview {
  canWrite: boolean;
  items: ChasseItem[];
  summary: ChasseSummary;
}
export interface ChasseTx {
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

const base = (c: number) => `/api/me/companies/${c}/chasse`;
const post = (url: string, body: unknown) => apiFetch<{ ok: boolean; total?: number }>(url, { method: 'POST', body: JSON.stringify(body) });
const patch = (url: string, body: unknown) => apiFetch<{ ok: boolean }>(url, { method: 'PATCH', body: JSON.stringify(body) });
const del = (url: string) => apiFetch<{ ok: boolean }>(url, { method: 'DELETE' });

export const getChasseOverview = (c: number) => apiFetch<ChasseOverview>(`${base(c)}/overview`);
export const getChasseTransactions = (c: number, type?: 'buy' | 'sell') =>
  apiFetch<{ canWrite: boolean; transactions: ChasseTx[] }>(`${base(c)}/transactions${type ? `?type=${type}` : ''}`);

export interface ChasseItemInput { name: string; buyPrice: number; sellPrice: number; venteClient: boolean }
export const addChasseItem = (c: number, b: ChasseItemInput) => post(`${base(c)}/items`, b);
export const updateChasseItem = (c: number, id: number, b: Partial<ChasseItemInput> & { active?: boolean }) => patch(`${base(c)}/items/${id}`, b);
export const deleteChasseItem = (c: number, id: number) => del(`${base(c)}/items/${id}`);

export interface ChasseTxInput { itemId: number; qty: number; unitPrice: number; clientName?: string; note?: string }
export const addChasseBuy = (c: number, b: ChasseTxInput) => post(`${base(c)}/buys`, b);
export const addChasseSell = (c: number, b: ChasseTxInput) => post(`${base(c)}/sells`, b);
export const deleteChasseTx = (c: number, id: number) => del(`${base(c)}/transactions/${id}`);
