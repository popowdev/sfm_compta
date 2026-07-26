import { apiFetch, ApiError } from './api';
import type { TicketType, TicketPriority, TicketStatus } from '@rp-compta/shared';

export interface TicketAttachment {
  id: number;
  name: string | null;
  url: string;
}

async function postForm<T>(url: string, fields: Record<string, string>, files: File[]): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== '') fd.append(k, v);
  for (const f of files) fd.append('files', f);
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string; errorId?: string } | null;
    throw new ApiError(res.status, b?.error ?? null, b?.errorId ?? null);
  }
  return (await res.json()) as T;
}

export interface Ticket {
  id: number;
  ref: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  userId: number;
  assignedUserId: number | null;
  companyId: number | null;
  contextPath: string | null;
  contextErrorCode: string | null;
  contextAgent: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  authorName?: string | null;
  companyName?: string | null;
}

export interface TicketReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface TicketMessage {
  id: number;
  body: string;
  internal: boolean;
  createdAt: string;
  authorId: number | null;
  authorName: string | null;
  authorAvatar: string | null;
  attachments: TicketAttachment[];
  reactions: TicketReaction[];
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
}

export interface NewTicket {
  type: TicketType;
  priority: TicketPriority;
  title: string;
  body: string;
  companyId?: number | null;
  contextPath?: string | null;
  contextErrorCode?: string | null;
}

export const closeMyTicket = (ref: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/tickets/${ref}/close`, { method: 'POST' });
export const getMyTickets = () => apiFetch<Ticket[]>('/api/me/tickets');
export const getMyTicket = (ref: string) => apiFetch<TicketDetail>(`/api/me/tickets/${ref}`);
export const createTicket = (t: NewTicket, files: File[] = []) =>
  postForm<{ ok: boolean; ref: string }>(
    '/api/me/tickets',
    {
      type: t.type,
      priority: t.priority,
      title: t.title,
      body: t.body,
      contextPath: t.contextPath ?? '',
      contextErrorCode: t.contextErrorCode ?? '',
    },
    files,
  );
export const replyToMyTicket = (ref: string, body: string, files: File[] = []) =>
  postForm<{ ok: boolean }>(`/api/me/tickets/${ref}/messages`, { body }, files);
export const reactToMyTicketMessage = (ref: string, messageId: number, emoji: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/tickets/${ref}/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) });

export interface SupportList {
  tickets: Ticket[];
  total: number;
  open: number;
  page: number;
  limit: number;
}

export interface SupportFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  mine?: boolean;
  q?: string;
  page?: number;
}

export const getSupportTickets = (f: SupportFilters = {}) => {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.priority) p.set('priority', f.priority);
  if (f.type) p.set('type', f.type);
  if (f.mine) p.set('mine', 'true');
  if (f.q) p.set('q', f.q);
  if (f.page) p.set('page', String(f.page));
  const qs = p.toString();
  return apiFetch<SupportList>(`/api/support/tickets${qs ? `?${qs}` : ''}`);
};
export const getSupportTicket = (ref: string) => apiFetch<TicketDetail>(`/api/support/tickets/${ref}`);
export const replyToSupportTicket = (ref: string, body: string, internal = false, files: File[] = []) =>
  postForm<{ ok: boolean }>(
    `/api/support/tickets/${ref}/messages`,
    { body, internal: String(internal) },
    files,
  );
export const patchSupportTicket = (
  ref: string,
  patch: { status?: TicketStatus; priority?: TicketPriority; assignToMe?: boolean; unassign?: boolean },
) => apiFetch<{ ok: boolean }>(`/api/support/tickets/${ref}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const reactToSupportTicketMessage = (ref: string, messageId: number, emoji: string) =>
  apiFetch<{ ok: boolean }>(`/api/support/tickets/${ref}/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) });

export interface TicketEvent {
  id: number;
  ref: string;
  eventType: string;
  actorName: string | null;
  detail: string | null;
  createdAt: string;
  ticketTitle: string | null;
  ticketStatus: string | null;
}
export interface TicketLogsResult {
  events: TicketEvent[];
  total: number;
  page: number;
  limit: number;
  types: { type: string; count: number }[];
}
export const getTicketLogs = (f: { ref?: string; type?: string; page?: number } = {}) => {
  const p = new URLSearchParams();
  if (f.ref) p.set('ref', f.ref);
  if (f.type) p.set('type', f.type);
  if (f.page) p.set('page', String(f.page));
  const qs = p.toString();
  return apiFetch<TicketLogsResult>(`/api/dev/ticket-logs${qs ? `?${qs}` : ''}`);
};
