import { useState } from 'react';
import { useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Wallet, CheckCircle2, Hash, Receipt, Check, Minus } from 'lucide-react';
import { EXPENSE_CATEGORIES, moduleConfigBool, type ExpenseCategory } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
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
const labelCls = 'mb-1 block text-muted-foreground';

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
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('depenses');
  const showDeductible = moduleConfigBool(
    company?.modules.find((m) => m.key === 'depenses')?.config,
    'depenses',
    'deductible',
  );
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const q = useQuery({ queryKey: ['expenses', companyId], queryFn: () => getExpenses(companyId) });

  const [form, setForm] = useState(() => ({ ...EMPTY, expenseDate: today() }));
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setOpen(false);
    setEditing(null);
    setForm({ ...EMPTY, expenseDate: today() });
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', companyId] });
    close();
  };

  const create = useMutation({
    mutationFn: (body: ExpenseInput) => createExpense(companyId, body),
    onSuccess: invalidate,
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: ExpenseInput }) => updateExpense(companyId, v.id, v.body),
    onSuccess: invalidate,
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (eid: number) => deleteExpense(companyId, eid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses', companyId] }),
    onError: () => toast('Échec de la suppression.', 'error'),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, expenseDate: today() });
    setOpen(true);
  };
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
    setOpen(true);
  };

  const submit = () => {
    const amount = Number(form.amount) || 0;
    if (amount < 0) return;
    const body: ExpenseInput = {
      label: form.label.trim(),
      category: form.category,
      amount,
      taxDeductible: form.taxDeductible,
      expenseDate: form.expenseDate,
      notes: form.notes.trim() || undefined,
    };
    if (editing) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const list = q.data?.expenses ?? [];
  const total = list.reduce((s, e) => s + e.amount, 0);
  const deductible = list.filter((e) => e.taxDeductible).reduce((s, e) => s + e.amount, 0);
  const pending = create.isPending || update.isPending;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          {showDeductible && <KpiSkeleton />}
          <KpiSkeleton />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={Wallet} label="Total dépenses" value={`${fmtMoney(total)} $`} />
          {showDeductible && (
            <Kpi
              icon={CheckCircle2}
              label="Déductibles"
              value={`${fmtMoney(deductible)} $`}
              accent="text-primary"
            />
          )}
          <Kpi icon={Hash} label="Nombre" value={String(list.length)} accent="text-sky-400" />
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouvelle dépense
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aucune dépense enregistrée"
          hint="Suivez vos achats et charges pour piloter votre comptabilité."
          action={
            canCreate ? (
              <Button variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Nouvelle dépense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Libellé</th>
                  <th className="px-4 py-3 text-left font-semibold">Catégorie</th>
                  <th className="px-4 py-3 text-right font-semibold">Montant</th>
                  {showDeductible && (
                    <th className="px-4 py-3 text-center font-semibold">Déduct.</th>
                  )}
                  {(canEdit || canDelete) && (
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-accent/50"
                  >
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
                      <td className="px-4 py-3">
                        {e.taxDeductible ? (
                          <Check className="mx-auto h-4 w-4 text-primary" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                    )}
                    {(canEdit || canDelete) && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => startEdit(e)}
                              aria-label={`Modifier ${e.label}`}
                              title="Modifier"
                              className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: 'Supprimer cette dépense ?',
                                    message: e.label,
                                    destructive: true,
                                  })
                                )
                                  remove.mutate(e.id);
                              }}
                              aria-label={`Supprimer ${e.label}`}
                              title="Supprimer"
                              className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (canCreate || canEdit) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editing ? 'Modifier la dépense' : 'Nouvelle dépense'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (form.label.trim()) submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Libellé</span>
                  <input
                    className={inputCls}
                    placeholder="ex. plein essence camion"
                    value={form.label}
                    onChange={(ev) => set('label', ev.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Catégorie</span>
                  <select
                    className={inputCls}
                    value={form.category}
                    onChange={(ev) => set('category', ev.target.value as ExpenseCategory)}
                  >
                    {EXPENSE_CATEGORIES.filter((c) => c.key !== 'salary').map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Montant ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={form.amount}
                    onChange={(ev) => set('amount', ev.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Date</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.expenseDate}
                    onChange={(ev) => set('expenseDate', ev.target.value)}
                  />
                </label>
                {showDeductible && (
                  <label className="flex items-center gap-2 self-end pb-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={form.taxDeductible}
                      onChange={(ev) => set('taxDeductible', ev.target.checked)}
                    />
                    <span>Déductible des impôts</span>
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Notes</span>
                  <textarea
                    className={`${inputCls} h-16 py-2`}
                    value={form.notes}
                    onChange={(ev) => set('notes', ev.target.value)}
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!form.label.trim() || pending}>
                  {pending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter la dépense'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
