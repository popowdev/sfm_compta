import { apiFetch } from './api';
import type { ExpenseCategory } from '@rp-compta/shared';

export interface Expense {
  id: number;
  companyId: number;
  label: string;
  category: ExpenseCategory;
  amount: number;
  taxDeductible: boolean;
  expenseDate: string;
  notes: string | null;
  createdAt: string;
}

export interface ExpenseInput {
  label: string;
  category: ExpenseCategory;
  amount: number;
  taxDeductible: boolean;
  expenseDate: string;
  notes?: string;
}

export const getExpenses = (companyId: number) =>
  apiFetch<{ canWrite: boolean; expenses: Expense[] }>(`/api/me/companies/${companyId}/expenses`);

export const createExpense = (companyId: number, body: ExpenseInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateExpense = (companyId: number, id: number, body: ExpenseInput) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteExpense = (companyId: number, id: number) =>
  apiFetch<{ ok: boolean }>(`/api/me/companies/${companyId}/expenses/${id}`, {
    method: 'DELETE',
  });
