import { apiFetch } from './api';

export type NoteType = 'no_answer' | 'not_present' | 'other';

export interface CompanyNote {
  id: number;
  companyId: number;
  authorName: string;
  type: NoteType;
  incidentAt: string;
  body: string | null;
  createdAt: string;
}

export const NOTE_LABELS: Record<NoteType, string> = {
  no_answer: "N'a pas répondu",
  not_present: 'Pas sur place',
  other: 'Autre',
};

export const getCompanyNotes = (companyId: number) =>
  apiFetch<{ notes: CompanyNote[] }>(`/api/companies/${companyId}/notes`);

export const addCompanyNote = (
  companyId: number,
  body: { type: NoteType; incidentAt: string; body?: string },
) => apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/notes`, { method: 'POST', body: JSON.stringify(body) });

export const deleteCompanyNote = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/companies/${companyId}/notes/${id}`, { method: 'DELETE' });
