import { apiFetch } from './api';

export type WznType = 'video' | 'ecrit';

export interface WznArticle {
  id: number;
  title: string;
  type: WznType;
  likes: number;
  active: boolean;
  startWeek: string;
  weeks: number;
  endWeek: string;
  weekIndex: number;
  base: number;
  likesAmount: number;
  amount: number;
  counted: boolean;
}

export interface WznConfig {
  priceVideo: number;
  priceEcrit: number;
  priceLike: number;
  weeks: number;
}

export interface WznOverview {
  week: string;
  canWrite: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  config: WznConfig;
  articles: WznArticle[];
  total: number;
}

const base = (c: number) => `/api/me/companies/${c}/wzn`;

export const getWzn = (c: number, week?: string) =>
  apiFetch<WznOverview>(`${base(c)}${week ? `?week=${week}` : ''}`);

export const addWznArticle = (
  c: number,
  body: { title: string; type: WznType; likes?: number; startWeek?: string; notes?: string },
) => apiFetch<{ ok: boolean }>(base(c), { method: 'POST', body: JSON.stringify(body) });

export const patchWznArticle = (
  c: number,
  id: number,
  body: { title?: string; type?: WznType; likes?: number; startWeek?: string; notes?: string | null },
) => apiFetch<{ ok: boolean }>(`${base(c)}/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const setWznActive = (c: number, id: number, active: boolean) =>
  apiFetch<{ ok: boolean }>(`${base(c)}/${id}/active`, { method: 'PUT', body: JSON.stringify({ active }) });

export const deleteWznArticle = (c: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${base(c)}/${id}`, { method: 'DELETE' });
