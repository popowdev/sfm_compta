import { apiFetch } from './api';

export interface ShareRequest {
  id: number;
  buyerName: string;
  parts: number;
  status: 'pending' | 'accepted' | 'refused';
  createdAt: string;
}

export interface ShareListing {
  id: number;
  companyId: number;
  companyName: string;
  sellerName: string | null;
  parts: number;
  pricePerPart: number;
  note: string | null;
  status: 'open' | 'closed';
  createdAt: string;
  mine: boolean;
  myRequest: boolean;
  pendingCount: number;
  requests: ShareRequest[];
}

export const getShareListings = () => apiFetch<{ listings: ShareListing[] }>('/api/share-listings');

export const createListing = (body: {
  companyId: number;
  sellerShareholderId: number;
  parts: number;
  pricePerPart: number;
  note?: string;
}) => apiFetch<{ ok: boolean }>('/api/share-listings', { method: 'POST', body: JSON.stringify(body) });

export const deleteListing = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/share-listings/${id}`, { method: 'DELETE' });

export const requestPurchase = (id: number, body: { parts: number; buyerName: string }) =>
  apiFetch<{ ok: boolean }>(`/api/share-listings/${id}/request`, { method: 'POST', body: JSON.stringify(body) });

export const acceptRequest = (rid: number) =>
  apiFetch<{ ok: boolean }>(`/api/share-listings/requests/${rid}/accept`, { method: 'POST' });

export const refuseRequest = (rid: number) =>
  apiFetch<{ ok: boolean }>(`/api/share-listings/requests/${rid}/refuse`, { method: 'POST' });
