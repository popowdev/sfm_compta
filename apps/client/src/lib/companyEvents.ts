import { apiFetch, ApiError } from './api';

export interface CompanyEvent {
  id: number;
  companyId: number;
  title: string;
  posterUrl: string | null;
  eventDate: string;
  revenue: number;
  charges: number;
  profit: number;
  notes: string | null;
  createdAt: string;
}

export const getCompanyEvents = (companyId: number) =>
  apiFetch<{ events: CompanyEvent[] }>(`/api/me/companies/${companyId}/evenements`);

export async function createCompanyEvent(
  companyId: number,
  data: { title: string; eventDate: string; revenue: string; charges: string; notes?: string; poster?: File | null },
): Promise<void> {
  const fd = new FormData();
  fd.append('title', data.title);
  fd.append('eventDate', data.eventDate);
  fd.append('revenue', data.revenue);
  fd.append('charges', data.charges);
  if (data.notes) fd.append('notes', data.notes);
  if (data.poster) fd.append('poster', data.poster);
  const res = await fetch(`/api/me/companies/${companyId}/evenements`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? null);
  }
}

export const deleteCompanyEvent = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/evenements/${id}`, { method: 'DELETE' });
