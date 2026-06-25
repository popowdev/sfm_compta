import { apiFetch, ApiError } from './api';

export interface DocItem {
  id: number;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedByName: string | null;
  createdAt: string;
}

async function uploadDoc(url: string, file: File, name: string): Promise<void> {
  const fd = new FormData();
  fd.append('file', file);
  if (name.trim()) fd.append('name', name.trim());
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, b?.error ?? null);
  }
}

export const getCompanyDocuments = (companyId: number) =>
  apiFetch<{ canWrite: boolean; documents: DocItem[] }>(`/api/me/companies/${companyId}/documents`);

export const uploadCompanyDocument = (companyId: number, file: File, name: string) =>
  uploadDoc(`/api/me/companies/${companyId}/documents`, file, name);

export const deleteCompanyDocument = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/documents/${id}`, { method: 'DELETE' });

export const getIrsDocuments = () => apiFetch<{ documents: DocItem[] }>('/api/irs/documents');

export const uploadIrsDocument = (file: File, name: string) =>
  uploadDoc('/api/irs/documents', file, name);

export const deleteIrsDocument = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/irs/documents/${id}`, { method: 'DELETE' });
