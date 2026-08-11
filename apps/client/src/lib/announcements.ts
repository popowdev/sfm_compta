import { apiFetch } from './api';

export type AnnouncementType = 'irs' | 'dev';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  type: AnnouncementType;
  important: boolean;
  read: boolean;
  createdByName: string;
  createdAt: string;
}

export interface AnnouncementSummary {
  unreadCount: number;
  important: { id: number; title: string; body: string; type: AnnouncementType; createdByName: string; createdAt: string } | null;
}

export const getAnnouncements = () =>
  apiFetch<{ canManage: boolean; canPostDev: boolean; announcements: Announcement[] }>('/api/announcements');

export const getAnnouncementsSummary = () =>
  apiFetch<AnnouncementSummary>('/api/announcements/summary');

export const createAnnouncement = (body: { title: string; body: string; pinned?: boolean; type?: AnnouncementType; important?: boolean }) =>
  apiFetch<{ ok: boolean }>('/api/announcements', { method: 'POST', body: JSON.stringify(body) });

export const markAnnouncementRead = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/announcements/${id}/read`, { method: 'POST' });

export const deleteAnnouncement = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/announcements/${id}`, { method: 'DELETE' });
