import { apiFetch } from './api';

export interface FivemPlayer {
  id: number;
  discordId: string;
  identifier: string | null;
  name: string;
  job: string;
  jobGrade: number;
  online: boolean;
  updatedAt: string;
}

export interface FivemPlayersParams {
  page?: number;
  limit?: number;
  q?: string;
}

export const getFivemPlayers = (params: FivemPlayersParams = {}) => {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.q) sp.set('q', params.q);
  const qs = sp.toString();
  return apiFetch<{
    players: FivemPlayer[];
    total: number;
    page: number;
    limit: number;
    stats: { online: number; known: number; jobs: number };
  }>(`/api/fivem/players${qs ? `?${qs}` : ''}`);
};

export interface GameCharacter {
  name: string;
  jobId: string;
  job: string | null;
  grade: number;
  gradeLabel: string;
  unemployed: boolean;
}

export type MyCharactersResult =
  | { ok: true; characters: GameCharacter[]; selected: string | null }
  | { ok: false; reason: string; characters: GameCharacter[]; selected: string | null };

export interface ApplyResult {
  ok: boolean;
  companyId: number | null;
  job: string | null;
}

export const getMyFivemCharacters = () => apiFetch<MyCharactersResult>('/api/me/fivem/characters');

export const selectMyFivemCharacter = (name: string) =>
  apiFetch<ApplyResult>('/api/me/fivem/select', { method: 'POST', body: JSON.stringify({ name }) });

export const lookupFivemPlayer = (discordId: string) =>
  apiFetch<{ characters: GameCharacter[] }>(`/api/fivem/lookup/${encodeURIComponent(discordId)}`);

export const applyFivemPlayer = (discordId: string, name: string) =>
  apiFetch<ApplyResult>('/api/fivem/apply', { method: 'POST', body: JSON.stringify({ discordId, name }) });
