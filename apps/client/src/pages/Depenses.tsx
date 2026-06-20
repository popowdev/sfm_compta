import { useState } from 'react';
import { useCompany } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES, moduleConfigBool, type ExpenseCategory } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/declarations';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  type Expense,
  type ExpenseInput,
} from '@/lib/expenses';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY = {
  label: '',
  category: 'other' as ExpenseCategory,
  amount: '',
  taxDeductible: false,
  expenseDate: today(),
  notes: '',
};

export default function Depenses() {
  const { company, companyId } = useCompany();
  const showDeductible = moduleConfigBool(
    company?.modules.find((m) => m.key === 'depenses')?.config,
    'depenses',
    'deductible',
  );
  const queryClient = useQueryClient();

  const q = useQuery({ queryKey: ['expenses', companyId], queryFn: () => getExpenses(companyId) });

  const [form, setForm] = useState(() => ({ ...EMPTY, expenseDate: today() }));
  const [editing, setEditing] = useState<number | null>(null);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm({ ...EMPTY, expenseDate: today() });
    setEditing(null);
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', companyId] });
    reset();
  };

  const create = useMutation({
    mutationFn: (body: ExpenseInput) => createExpense(companyId, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: ExpenseInput }) => updateExpense(companyId, v.id, v.body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (eid: number) => deleteExpense(companyId, eid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses', companyId] }),
  });

  const startEdit = (e: Expense) => {
    setEditing(e.id);
    setForm({
      label: e.label,
      category: e.category,
      amount: String(e.amount),
      taxDeductible: e.taxDeductible,
      expenseDate: e.expenseDate.slice(0, 10),
      notes: e.notes ?? '',
    });
  };

  const submit = () => {
    const body: ExpenseInput = {
      label: form.label.trim(),
      category: form.category,
      amount: Number(form.amount) || 0,
      taxDeductible: form.taxDeductible,
      expenseDate: form.expenseDate,
      notes: form.notes.trim() || undefined,
    };
    if (editing) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const canWrite = q.data?.canWrite ?? false;
  const list = q.data?.expenses ?? [];
  const total = list.reduce((s, e) => s + e.amount, 0);
  const deductible = list.filter((e) => e.taxDeductible).reduce((s, e) => s + e.amount, 0);
  const pending = create.isPending || update.isPending;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total dépenses</div>
          <div className="text-lg font-semibold">{fmtMoney(total)} $</div>
        </div>
        {showDeductible && (
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">Déductibles</div>
            <div className="text-lg font-semibold text-primary">{fmtMoney(deductible)} $</div>
          </div>
        )}
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Nombre</div>
          <div className="text-lg font-semibold">{list.length}</div>
        </div>
      </div>

      {canWrite && (
        <form
          className="rounded-xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.label.trim()) submit();
          }}
        >
          <div className="mb-4 text-sm font-semibold">
            {editing ? 'Modifier la dépense' : 'Nouvelle dépense'}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Libellé</span>
              <input
                className={inputCls}
                placeholder="ex. plein essence camion"
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Catégorie</span>
              <select
                className={inputCls}
                value={form.category}
                onChange={(e) => set('category', e.target.value as ExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Montant ($)</span>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Date</span>
              <input
                type="date"
                className={inputCls}
                value={form.expenseDate}
                onChange={(e) => set('expenseDate', e.target.value)}
              />
            </label>
            {showDeductible && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.taxDeductible}
                  onChange={(e) => set('taxDeductible', e.target.checked)}
                />
                <span>Déductible des impôts</span>
              </label>
            )}
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Notes</span>
              <textarea
                className={`${inputCls} h-16 py-2`}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {editing && (
              <Button type="button" variant="outline" onClick={reset}>
                Annuler
              </Button>
            )}
            <Button type="submit" disabled={!form.label.trim() || pending}>
              {pending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter la dépense'}
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Libellé</th>
                <th className="px-4 py-3 text-left font-semibold">Catégorie</th>
                <th className="px-4 py-3 text-right font-semibold">Montant</th>
                {showDeductible && <th className="px-4 py-3 text-center font-semibold">Déduct.</th>}
                {canWrite && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {e.expenseDate.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    {e.label}
                    {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs">
                      {CAT_LABEL[e.category] ?? e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmtMoney(e.amount)} $</td>
                  {showDeductible && (
                    <td className="px-4 py-3 text-center">
                      {e.taxDeductible ? (
                        <span className="text-primary">✓</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  {canWrite && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(e)}
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Supprimer cette dépense ?')) remove.mutate(e.id);
                        }}
                        className="ml-3 text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
                      >
                        Suppr.
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={(canWrite ? 5 : 4) + (showDeductible ? 1 : 0)} className="px-4 py-4 text-muted-foreground">
                    Aucune dépense enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
