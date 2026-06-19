import { apiFetch } from './api';

export interface Message {
  id: number;
  companyId: number;
  body: string;
  fromIrs: boolean;
  senderName: string;
  createdAt: string;
  companyName?: string;
}

export const getMyMessages = (companyId: number) =>
  apiFetch<{ canWrite: boolean; messages: Message[] }>(
    `/api/me/companies/${companyId}/messages`,
  );

export const sendMyMessage = (companyId: number, body: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

export const getAllMessages = () => apiFetch<Message[]>('/api/messages');

export const sendIrsMessage = (companyId: number, body: string) =>
  apiFetch<{ ok: boolean }>(`/api/messages/${companyId}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
