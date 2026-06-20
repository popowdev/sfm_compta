import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import {
  moduleConfigBool,
  STOCK_UNITS,
  type StockUnit,
  type StockMovementType,
} from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/declarations';
import { ApiError } from '@/lib/api';
import { useModulePerms } from '@/lib/useCompany';
import {
  getStocks,
  createStock,
  updateStock,
  deleteStock,
  getStockMovements,
  addStockMovement,
  type StockItem,
  type StockItemInput,
  type StockMovementInput,
} from '@/lib/stocks';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const UNIT_SHORT: Record<string, string> = Object.fromEntries(STOCK_UNITS.map((u) => [u.key, u.short]));

const MOV_BADGE: Record<StockMovementType, { label: string; cls: string }> = {
  in: { label: 'Entrée', cls: 'bg-emerald-500/10 text-emerald-400' },
  out: { label: 'Sortie', cls: 'bg-destructive/10 text-destructive' },
  adjust: { label: 'Ajustement', cls: 'bg-amber-500/10 text-amber-400' },
};

function fmtQty(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const EMPTY = {
  name: '',
  category: '',
  unit: 'piece' as StockUnit,
  quantity: '',
  unitCost: '',
  lowStockThreshold: '',
  notes: '',
};
const EMPTY_MOV = { quantity: '', unitCost: '', supplier: '', reason: '' };

export default function Stocks() {
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('stocks');
  const cfg = company?.modules.find((m) => m.key === 'stocks')?.config;
  const showValuation = moduleConfigBool(cfg, 'stocks', 'valuation');
  const showThreshold = moduleConfigBool(cfg, 'stocks', 'threshold');
  const showSupplier = moduleConfigBool(cfg, 'stocks', 'supplier');
  const queryClient = useQueryClient();

  const q = useQuery({ queryKey: ['stocks', companyId], queryFn: () => getStocks(companyId) });

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [movItem, setMovItem] = useState<StockItem | null>(null);
  const [movType, setMovType] = useState<StockMovementType>('in');
  const [movForm, setMovForm] = useState({ ...EMPTY_MOV });
  const setMov = <K extends keyof typeof EMPTY_MOV>(k: K, v: (typeof EMPTY_MOV)[K]) =>
    setMovForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stocks', companyId] });

  const create = useMutation({
    mutationFn: (body: StockItemInput) => createStock(companyId, body),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: StockItemInput }) => updateStock(companyId, v.id, v.body),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteStock(companyId, id),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: (v: { id: number; body: StockMovementInput }) => addStockMovement(companyId, v.id, v.body),
    onSuccess: (_d, v) => {
      setMovItem(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['stock-movements', companyId, v.id] });
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      alert(
        code === 'negative_stock'
          ? 'Stock insuffisant : le mouvement rendrait la quantité négative.'
          : code === 'quantity_overflow'
            ? 'Quantité trop élevée : la limite du stock serait dépassée.'
            : "Échec de l'enregistrement du mouvement.",
      );
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };
  const openEdit = (it: StockItem) => {
    setEditing(it.id);
    setForm({
      name: it.name,
      category: it.category ?? '',
      unit: it.unit,
      quantity: String(it.quantity),
      unitCost: String(it.unitCost),
      lowStockThreshold: String(it.lowStockThreshold),
      notes: it.notes ?? '',
    });
    setOpen(true);
  };
  const openMov = (it: StockItem, type: StockMovementType) => {
    setMovItem(it);
    setMovType(type);
    setMovForm({ ...EMPTY_MOV });
  };

  const qtyNum = Number(form.quantity);
  const valid =
    form.name.trim().length > 0 &&
    form.quantity !== '' &&
    Number.isFinite(qtyNum) &&
    qtyNum >= 0 &&
    (!showValuation || (form.unitCost !== '' && Number(form.unitCost) >= 0));

  const submit = () => {
    const body: StockItemInput = {
      name: form.name.trim(),
      category: form.category.trim() || undefined,
      unit: form.unit,
      quantity: editing !== null ? Number(form.quantity) || 0 : qtyNum,
      unitCost: showValuation ? Number(form.unitCost) || 0 : 0,
      lowStockThreshold: showThreshold ? Number(form.lowStockThreshold) || 0 : 0,
      notes: form.notes.trim() || undefined,
    };
    if (editing !== null) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const movQtyNum = Number(movForm.quantity);
  const movValid =
    movForm.quantity !== '' &&
    Number.isFinite(movQtyNum) &&
    (movType === 'adjust' ? movQtyNum !== 0 : movQtyNum > 0);
  const submitMov = () => {
    if (!movItem) return;
    const body: StockMovementInput = {
      type: movType,
      quantity: movQtyNum,
      unitCost:
        movType === 'in' && showValuation && movForm.unitCost !== '' ? Number(movForm.unitCost) : undefined,
      supplier:
        movType === 'in' && showSupplier && movForm.supplier.trim() ? movForm.supplier.trim() : undefined,
      reason: movForm.reason.trim() || undefined,
    };
    move.mutate({ id: movItem.id, body });
  };

  const items = q.data?.items ?? [];
  const totalValue = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
  const lowCount = items.filter((it) => it.lowStockThreshold > 0 && it.quantity <= it.lowStockThreshold).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">Articles </span>
            <span className="font-semibold">{items.length}</span>
          </div>
          {showValuation && (
            <div className="rounded-lg border bg-card px-4 py-2">
              <span className="text-sm text-muted-foreground">Valeur du stock </span>
              <span className="font-semibold text-primary">{fmtMoney(totalValue)} $</span>
            </div>
          )}
          {showThreshold && (
            <div className="rounded-lg border bg-card px-4 py-2">
              <span className="text-sm text-muted-foreground">En alerte </span>
              <span className={`font-semibold ${lowCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {lowCount}
              </span>
            </div>
          )}
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouvel article
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((it) => {
          const isOpen = expanded.has(it.id);
          const isLow = showThreshold && it.lowStockThreshold > 0 && it.quantity <= it.lowStockThreshold;
          return (
            <div key={it.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => toggle(it.id)}
                  aria-expanded={isOpen}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isOpen ? '' : '-rotate-90'
                      }`}
                    />
                    <span className="text-base font-semibold">{it.name}</span>
                    {it.category && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {it.category}
                      </span>
                    )}
                    {isLow && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        stock bas
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                    <span>
                      <span className="text-sm font-semibold text-foreground">{fmtQty(it.quantity)}</span>{' '}
                      {UNIT_SHORT[it.unit]}
                    </span>
                    {showValuation && (
                      <>
                        <span>{fmtMoney(it.unitCost)} $ / {UNIT_SHORT[it.unit]}</span>
                        <span>valeur {fmtMoney(it.quantity * it.unitCost)} $</span>
                      </>
                    )}
                    {showThreshold && it.lowStockThreshold > 0 && (
                      <span>seuil {fmtQty(it.lowStockThreshold)}</span>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {canCreate && (
                    <>
                      <button
                        type="button"
                        onClick={() => openMov(it, 'in')}
                        title="Entrée de stock"
                        className="grid h-8 w-8 place-items-center rounded-md border text-emerald-400 transition-colors hover:bg-emerald-500/10"
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openMov(it, 'out')}
                        title="Sortie de stock"
                        className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <ArrowUpFromLine className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openMov(it, 'adjust')}
                        title="Ajuster / inventaire"
                        className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEdit(it)}
                      title="Modifier l'article"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Supprimer l'article « ${it.name} » et son historique ?`)) remove.mutate(it.id);
                      }}
                      title="Supprimer"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  {it.notes && <div className="mb-3 text-sm text-muted-foreground">{it.notes}</div>}
                  <MovementHistory companyId={companyId} itemId={it.id} showValuation={showValuation} />
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Aucun article en stock.</p>
            {canCreate && (
              <Button variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Ajouter le premier article
              </Button>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editing !== null ? "Modifier l'article" : 'Nouvel article'}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Nom de l'article</span>
                  <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Catégorie</span>
                  <input
                    className={inputCls}
                    value={form.category}
                    onChange={(e) => set('category', e.target.value)}
                    placeholder="Optionnel"
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Unité</span>
                  <select
                    className={inputCls}
                    value={form.unit}
                    onChange={(e) => set('unit', e.target.value as StockUnit)}
                  >
                    {STOCK_UNITS.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Quantité {editing !== null && '(via mouvements)'}</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className={inputCls}
                    value={form.quantity}
                    onChange={(e) => set('quantity', e.target.value)}
                    disabled={editing !== null}
                  />
                </label>
                {showValuation && (
                  <label className="text-sm">
                    <span className={labelCls}>Coût unitaire ($)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputCls}
                      value={form.unitCost}
                      onChange={(e) => set('unitCost', e.target.value)}
                    />
                  </label>
                )}
                {showThreshold && (
                  <label className="text-sm">
                    <span className={labelCls}>Seuil d'alerte</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className={inputCls}
                      value={form.lowStockThreshold}
                      onChange={(e) => set('lowStockThreshold', e.target.value)}
                      placeholder="0 = pas d'alerte"
                    />
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Notes</span>
                  <textarea
                    className={`${inputCls} h-20 py-2`}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </label>
              </div>
              {editing !== null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  La quantité se modifie via les mouvements (entrée / sortie / ajustement).
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!valid || create.isPending || update.isPending}>
                  {create.isPending || update.isPending
                    ? 'Enregistrement…'
                    : editing !== null
                      ? 'Enregistrer'
                      : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {movItem && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setMovItem(null)}>
          <div
            className="w-full max-w-md rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {MOV_BADGE[movType].label} · {movItem.name}
              </h2>
              <button
                type="button"
                onClick={() => setMovItem(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (movValid) submitMov();
              }}
            >
              <div className="mb-3 rounded-lg border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                Stock actuel :{' '}
                <span className="font-semibold text-foreground">
                  {fmtQty(movItem.quantity)} {UNIT_SHORT[movItem.unit]}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className={labelCls}>
                    {movType === 'adjust' ? 'Correction (+/−)' : 'Quantité'} ({UNIT_SHORT[movItem.unit]})
                  </span>
                  <input
                    type="number"
                    step="0.001"
                    className={inputCls}
                    value={movForm.quantity}
                    onChange={(e) => setMov('quantity', e.target.value)}
                    autoFocus
                  />
                </label>
                {movType === 'in' && showValuation && (
                  <label className="text-sm">
                    <span className={labelCls}>Coût unitaire ($)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputCls}
                      value={movForm.unitCost}
                      onChange={(e) => setMov('unitCost', e.target.value)}
                      placeholder="Optionnel"
                    />
                  </label>
                )}
                {movType === 'in' && showSupplier && (
                  <label className="text-sm sm:col-span-2">
                    <span className={labelCls}>Fournisseur</span>
                    <input
                      className={inputCls}
                      value={movForm.supplier}
                      onChange={(e) => setMov('supplier', e.target.value)}
                      placeholder="Optionnel"
                    />
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Motif</span>
                  <input
                    className={inputCls}
                    value={movForm.reason}
                    onChange={(e) => setMov('reason', e.target.value)}
                    placeholder="Optionnel"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setMovItem(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!movValid || move.isPending}>
                  {move.isPending ? 'Enregistrement…' : 'Valider'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MovementHistory({
  companyId,
  itemId,
  showValuation,
}: {
  companyId: number;
  itemId: number;
  showValuation: boolean;
}) {
  const q = useQuery({
    queryKey: ['stock-movements', companyId, itemId],
    queryFn: () => getStockMovements(companyId, itemId),
  });
  if (q.isLoading) return <div className="text-xs text-muted-foreground">Chargement…</div>;
  const moves = q.data ?? [];
  if (moves.length === 0)
    return <div className="text-xs text-muted-foreground">Aucun mouvement enregistré.</div>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Date</th>
            <th className="px-3 py-2 text-left font-semibold">Type</th>
            <th className="px-3 py-2 text-right font-semibold">Quantité</th>
            {showValuation && <th className="px-3 py-2 text-right font-semibold">Coût</th>}
            <th className="px-3 py-2 text-left font-semibold">Motif</th>
            <th className="px-3 py-2 text-left font-semibold">Par</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => (
            <tr key={m.id} className={i > 0 ? 'border-t' : ''}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                {fmtDateTime(m.createdAt)}
              </td>
              <td className="px-3 py-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${MOV_BADGE[m.type].cls}`}>
                  {MOV_BADGE[m.type].label}
                </span>
              </td>
              <td
                className={`px-3 py-2 text-right font-medium ${
                  m.quantity > 0 ? 'text-emerald-400' : m.quantity < 0 ? 'text-destructive' : ''
                }`}
              >
                {m.quantity > 0 ? '+' : ''}
                {fmtQty(m.quantity)}
              </td>
              {showValuation && (
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  {m.unitCost === null ? '—' : `${fmtMoney(m.unitCost)} $`}
                </td>
              )}
              <td className="px-3 py-2 text-xs">
                {m.reason || (m.supplier ? `Fournisseur : ${m.supplier}` : '—')}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{m.createdByName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
