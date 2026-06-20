import { apiFetch } from './api';
import type { EmployeePosition } from '@rp-compta/shared';

export interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  minutes: number | null;
  salary: number;
}

export interface EmployeeTimesheet {
  id: number;
  name: string;
  position: EmployeePosition;
  hourlyRate: number;
  active: boolean;
  entries: TimeEntry[];
  totals: { minutes: number; salary: number; days: number };
}

export interface AddTimeEntryInput {
  employeeId: number;
  date: string;
  clockIn: string;
  clockOut?: string;
}

export const getTimeclock = (companyId: number) =>
  apiFetch<{ canWrite: boolean; employees: EmployeeTimesheet[] }>(
    `/api/me/companies/${companyId}/timeclock`,
  );

export const addTimeEntry = (companyId: number, body: AddTimeEntryInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/timeclock`, {
    method: 'POST',
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

export function fmtTime(dt: string): string {
  return dt.slice(11, 16);
}

export function fmtDay(dt: string): { date: string; weekday: string } {
  const d = new Date(`${dt.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { date: dt.slice(0, 10), weekday: '' };
  return {
    date: d.toLocaleDateString('fr-FR'),
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'long' }),
  };
}
