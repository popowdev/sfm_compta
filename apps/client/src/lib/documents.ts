import { apiFetch, ApiError } from './api';

export interface DocItem {
  id: number;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  folder: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export async function uploadDoc(url: string, file: File, name: string, folder?: string): Promise<void> {
  const fd = new FormData();
  fd.append('file', file);
  if (name.trim()) fd.append('name', name.trim());
  if (folder && folder.trim()) fd.append('folder', folder.trim());
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, b?.error ?? null);
  }
}

export interface DocFolder { name: string; count: number }

const cBase = (companyId: number) => `/api/me/companies/${companyId}/documents`;

export const getCompanyDocuments = (companyId: number) =>
  apiFetch<{ canWrite: boolean; folders: DocFolder[]; documents: DocItem[] }>(cBase(companyId));

export const uploadCompanyDocument = (companyId: number, file: File, name: string, folder?: string) =>
  uploadDoc(cBase(companyId), file, name, folder);

export const deleteCompanyDocument = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`${cBase(companyId)}/${id}`, { method: 'DELETE' });

export const createDocFolder = (companyId: number, name: string) =>
  apiFetch<{ ok: boolean }>(`${cBase(companyId)}/folders`, { method: 'POST', body: JSON.stringify({ name }) });
export const renameDocFolder = (companyId: number, from: string, to: string) =>
  apiFetch<{ ok: boolean }>(`${cBase(companyId)}/folders`, { method: 'PATCH', body: JSON.stringify({ from, to }) });
export const deleteDocFolder = (companyId: number, name: string) =>
  apiFetch<{ ok: boolean }>(`${cBase(companyId)}/folders/${encodeURIComponent(name)}`, { method: 'DELETE' });
export const moveCompanyDocument = (companyId: number, id: number, folder: string | null) =>
  apiFetch<{ ok: boolean }>(`${cBase(companyId)}/${id}/folder`, { method: 'PATCH', body: JSON.stringify({ folder }) });

export const getIrsDocuments = () => apiFetch<{ documents: DocItem[] }>('/api/irs/documents');

export const uploadIrsDocument = (file: File, name: string, folder?: string) =>
  uploadDoc('/api/irs/documents', file, name, folder);

export const deleteIrsDocument = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/irs/documents/${id}`, { method: 'DELETE' });
