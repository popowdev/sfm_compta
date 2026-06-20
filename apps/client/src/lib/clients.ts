import { apiFetch } from './api';
import type { LoyaltyTier } from '@rp-compta/shared';

export interface Client {
  id: number;
  companyId: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  loyaltyTier: LoyaltyTier;
  loyaltyPoints: number;
  totalSpent: number;
  accountBalance: number;
  creditLimit: number;
  createdAt: string;
}

export interface ClientInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  loyaltyTier?: LoyaltyTier;
  loyaltyPoints?: number;
  totalSpent?: number;
  accountBalance?: number;
  creditLimit?: number;
}

export const getClients = (companyId: number) =>
  apiFetch<{ canWrite: boolean; clients: Client[] }>(`/api/me/companies/${companyId}/clients`);

export const createClient = (companyId: number, body: ClientInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/clients`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateClient = (companyId: number, id: number, body: ClientInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteClient = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/clients/${id}`, {
    method: 'DELETE',
  });

export interface LoyaltyTierDef {
  tier: LoyaltyTier;
  name: string;
  threshold: number;
}

export const getLoyaltyTiers = (companyId: number) =>
  apiFetch<{ canManage: boolean; tiers: LoyaltyTierDef[] }>(
    `/api/me/companies/${companyId}/loyalty-tiers`,
  );

export const saveLoyaltyTiers = (companyId: number, tiers: LoyaltyTierDef[]) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/loyalty-tiers`, {
    method: 'PUT',
    body: JSON.stringify({ tiers }),
  });

export const adjustClientBalance = (companyId: number, id: number, delta: number, reason?: string) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/clients/${id}/balance`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  });

export const TIER_CLS: Record<LoyaltyTier, string> = {
  bronze: 'bg-amber-700/15 text-amber-600',
  silver: 'bg-slate-400/15 text-slate-300',
  gold: 'bg-yellow-500/15 text-yellow-400',
  platinum: 'bg-sky-400/15 text-sky-300',
};
