import { apiFetch } from './api';

export interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  workedMinutes: number;
  pauseMinutes: number;
  salary: number;
  complete: boolean;
}

export interface EmployeeTimesheet {
  id: number;
  name: string;
  grade: string | null;
  hourlyRate: number;
  active: boolean;
  entries: TimeEntry[];
  totals: { minutes: number; salary: number; days: number };
}

export interface MyTimeclock {
  canManageTeam: boolean;
  employee: { id: number; name: string; hourlyRate: number } | null;
  current: { id: number; clockIn: string; pauseStart: string | null; pauseMinutes: number } | null;
  recent: TimeEntry[];
  now: string;
}

export interface AddTimeEntryInput {
  employeeId: number;
  date: string;
  clockIn: string;
  clockOut?: string;
}

export const getMyTimeclock = (companyId: number) =>
  apiFetch<MyTimeclock>(`/api/me/companies/${companyId}/timeclock/me`);

const selfAction = (companyId: number, action: 'start' | 'pause' | 'resume' | 'stop') =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/timeclock/me/${action}`, {
    method: 'POST',
  });
export const clockStart = (companyId: number) => selfAction(companyId, 'start');
export const clockPause = (companyId: number) => selfAction(companyId, 'pause');
export const clockResume = (companyId: number) => selfAction(companyId, 'resume');
export const clockStop = (companyId: number) => selfAction(companyId, 'stop');

export const getTimeclock = (companyId: number) =>
  apiFetch<{ canWrite: boolean; canEdit: boolean; canDelete: boolean; employees: EmployeeTimesheet[] }>(
    `/api/me/companies/${companyId}/timeclock`,
  );

export const addTimeEntry = (companyId: number, body: AddTimeEntryInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/timeclock`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export type EditTimeEntryInput = Omit<AddTimeEntryInput, 'employeeId'>;

export const updateTimeEntry = (companyId: number, id: number, body: EditTimeEntryInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/timeclock/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteTimeEntry = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/timeclock/${id}`, {
    method: 'DELETE',
  });

export function fmtHours(minutes: number | null): string {
  if (minutes === null) return '—';
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const PARIS = 'Europe/Paris';

function utcDate(dt: string): Date {
  const iso = dt.includes('T') ? dt : dt.replace(' ', 'T');
  return new Date(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

export function fmtTime(dt: string): string {
  const d = utcDate(dt);
  if (Number.isNaN(d.getTime())) return dt.slice(11, 16);
  return d.toLocaleTimeString('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(dt: string): { date: string; weekday: string } {
  const d = utcDate(dt);
  if (Number.isNaN(d.getTime())) return { date: dt.slice(0, 10), weekday: '' };
  return {
    date: d.toLocaleDateString('fr-FR', { timeZone: PARIS }),
    weekday: d.toLocaleDateString('fr-FR', { timeZone: PARIS, weekday: 'long' }),
  };
}

export function dayKey(dt: string): string {
  const d = utcDate(dt);
  if (Number.isNaN(d.getTime())) return dt.slice(0, 10);
  return new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function parseLocal(dt: string): number {
  return utcDate(dt).getTime();
}
