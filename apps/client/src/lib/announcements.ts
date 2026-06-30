import { apiFetch } from './api';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdByName: string;
  createdAt: string;
}

export const getAnnouncements = () =>
  apiFetch<{ canManage: boolean; announcements: Announcement[] }>('/api/announcements');

export const createAnnouncement = (body: { title: string; body: string; pinned?: boolean }) =>
  apiFetch<{ ok: boolean }>('/api/announcements', { method: 'POST', body: JSON.stringify(body) });

export const deleteAnnouncement = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/announcements/${id}`, { method: 'DELETE' });
