import { apiFetch } from './api';

export interface IrsOverview {
  kpis: {
    companies: number;
    associations: number;
    pendingSubventions: number;
    submittedDeclarations: number;
    taxesCollected: number;
    caDeclared: number;
  };
  pendingSubventions: { id: number; companyName: string; motif: string; amountRequested: number; createdAt: string }[];
  submittedDeclarations: { id: number; companyName: string; weekLabel: string; totalTax: number; createdAt: string }[];
  recentMessages: { id: number; companyName: string; fromIrs: boolean; senderName: string; body: string; createdAt: string }[];
}

export const getIrsOverview = () => apiFetch<IrsOverview>('/api/irs/overview');
