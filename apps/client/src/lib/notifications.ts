import { apiFetch } from './api';

export interface Notif {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export const getNotifications = () =>
  apiFetch<{ unread: number; notifications: Notif[] }>('/api/me/notifications');

export const markAllNotificationsRead = () =>
  apiFetch<{ ok: boolean }>('/api/me/notifications/read-all', { method: 'POST' });

export const markNotificationRead = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/notifications/${id}/read`, { method: 'PATCH' });
