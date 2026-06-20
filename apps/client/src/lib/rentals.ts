import { apiFetch } from './api';

export type DepositStatus = 'paid' | 'returned' | 'kept';
export type RentalStatus = 'reserved' | 'active' | 'completed' | 'cancelled';

export interface Rental {
  id: number;
  companyId: number;
  clientName: string;
  clientPhone: string | null;
  label: string;
  eventDate: string;
  eventTime: string | null;
  durationHours: number | null;
  rentalPrice: number;
  deposit: number;
  depositStatus: DepositStatus;
  status: RentalStatus;
  notes: string | null;
  createdAt: string;
}

export interface RentalInput {
  clientName: string;
  clientPhone?: string;
  label: string;
  eventDate: string;
  eventTime?: string;
  durationHours?: number;
  rentalPrice: number;
  deposit: number;
  depositStatus: DepositStatus;
  status: RentalStatus;
  notes?: string;
}

export const getRentals = (companyId: number) =>
  apiFetch<{ canWrite: boolean; rentals: Rental[] }>(`/api/me/companies/${companyId}/rentals`);

export const createRental = (companyId: number, body: RentalInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/rentals`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateRental = (companyId: number, id: number, body: RentalInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/rentals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteRental = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/rentals/${id}`, {
    method: 'DELETE',
  });

export const RENTAL_STATUS: Record<RentalStatus, { label: string; cls: string }> = {
  reserved: { label: 'réservé', cls: 'bg-amber-500/10 text-amber-400' },
  active: { label: 'en cours', cls: 'bg-sky-500/10 text-sky-400' },
  completed: { label: 'terminé', cls: 'bg-primary/10 text-primary' },
  cancelled: { label: 'annulé', cls: 'bg-destructive/10 text-destructive' },
};

export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; cls: string }> = {
  paid: { label: 'caution payée', cls: 'bg-emerald-500/10 text-emerald-400' },
  returned: { label: 'caution rendue', cls: 'bg-muted text-muted-foreground' },
  kept: { label: 'caution conservée', cls: 'bg-amber-500/10 text-amber-400' },
};
