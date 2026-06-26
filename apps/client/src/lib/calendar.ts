import { apiFetch } from './api';

export interface CalEvent {
  id: number;
  title: string;
  category: string | null;
  ownerType: 'company' | 'association';
  ownerId: number | null;
  ownerName: string;
  ownerSlug: string | null;
  startAt: string; // "YYYY-MM-DD HH:MM:SS"
  endAt: string;
  canManage: boolean;
}

export interface CalEntity {
  type: 'company' | 'association';
  id: number;
  name: string;
  slug: string;
}

export interface CreateEventInput {
  title: string;
  category?: string;
  ownerType: 'company' | 'association';
  ownerId: number;
  startAt: string;
  endAt: string;
}

export const getCalendar = (from: string, to: string) =>
  apiFetch<{ events: CalEvent[] }>(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const getCalendarEntities = () => apiFetch<{ entities: CalEntity[] }>('/api/calendar/entities');

export const createEvent = (body: CreateEventInput) =>
  apiFetch<{ ok: boolean }>('/api/calendar', { method: 'POST', body: JSON.stringify(body) });

export const deleteEvent = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/calendar/${id}`, { method: 'DELETE' });
