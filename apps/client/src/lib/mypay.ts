import { apiFetch } from './api';

export interface MyPayWeek {
  exerciceId: number | null;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  hours: number;
  cappedHours: number;
  base: number;
  caisseCommission: number;
  garageCommission: number;
  taxiCommission: number;
  pawnshopCommission: number;
  chasseCommission: number;
  runsCommission: number;
  peakBonus: number;
  bonus: number;
  deductions: number;
  paid: number;
  coursesCount: number;
  salesCount: number;
  garageCount: number;
  runsCount: number;
  isPaid: boolean;
}
export interface MyPay {
  hasFiche: boolean;
  employee?: { name: string; iban: string | null; gradeName: string | null; commissionRate: number };
  weeks: MyPayWeek[];
}

export const getMyPay = (companyId: number) => apiFetch<MyPay>(`/api/me/companies/${companyId}/my-pay`);
