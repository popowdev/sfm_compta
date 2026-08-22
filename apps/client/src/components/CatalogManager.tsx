import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, ChevronDown, Boxes, Wrench, Search, Check, ArrowLeft, ArrowRight, Hammer, Minus } from 'lucide-react';
import { CATALOG_ITEM_TYPES, type CatalogItemType } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { fmtMoney } from '@/lib/declarations';
import { ApiError } from '@/lib/api';
import {
  getCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  setCatalogRecipe,
  craftItems,
  adjustCatalogStock,
  type CatalogItem,
  type CatalogItemInput,
} from '@/lib/catalog';
import { getStockCategories } from '@/lib/stockCategories';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';
const TYPE_LABEL: Record<string, string> = Object.fromEntries(CATALOG_ITEM_TYPES.map((t) => [t.key, t.label]));

interface WizForm {
  name: string;
  categoryId: number | '';
  ownStock: boolean;
  stockQty: string;
  type: CatalogItemType;
  price: string;
  active: boolean;
  notes: string;
}
const EMPTY_FORM: WizForm = {
  name: '',
  categoryId: '',
  ownStock: false,
  stockQty: '',
  type: 'product',
  price: '',
  active: true,
  notes: '',
};

export function CatalogManager({
  companyId,
  canCreate,
  canEdit,
  canDelete,
}: {
  companyId: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['catalog', companyId], queryFn: () => getCatalog(companyId) });
  const cats = useQuery({ queryKey: ['stock-categories', companyId], queryFn: () => getStockCategories(companyId) });

  const items = q.data?.items ?? [];
  const stocks = q.data?.stockItems ?? [];
  const stocksVisible = q.data?.stocksVisible ?? false;
  const categories = cats.data?.categories ?? [];
  const stockById = new Map(stocks.map((s) => [s.id, s]));

  const [expanded, setExpanded] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizForm>({ ...EMPTY_FORM });
  const [selected, setSelected] = useState<number[]>([]);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [matSearch, setMatSearch] = useState('');
  const set = <K extends keyof WizForm>(k: K, v: WizForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['catalog', companyId] });

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setSelected([]);
    setQty({});
    setMatSearch('');
    setStep(0);
    setOpen(true);
  };
  const openEdit = (it: CatalogItem) => {
    setEditingId(it.id);
    setForm({
      name: it.name,
      categoryId: it.categoryId ?? '',
      ownStock: it.stockItemId != null,
      stockQty: it.stockQuantity != null ? String(it.stockQuantity) : '',
      type: it.type,
      price: String(it.price),
      active: it.active,
      notes: it.notes ?? '',
    });
    setSelected(it.recipe.map((r) => r.stockItemId));
    setQty(Object.fromEntries(it.recipe.map((r) => [r.stockItemId, String(r.quantity)])));
    setMatSearch('');
    setStep(0);
    setOpen(true);
  };

  const toggleMat = (id: number) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setQty((qq) => (qq[id] ? qq : { ...qq, [id]: '1' }));
  };

  const isProduct = form.type === 'product';
  const steps = isProduct ? ['Article', 'Matières premières', 'Quantités'] : ['Article'];
  const isLast = step === steps.length - 1;

  const priceNum = Number(form.price);
  const lines = selected
    .map((id) => ({ stockItemId: id, quantity: Number(qty[id]) || 0 }))
    .filter((l) => l.quantity > 0);
  const cost = isProduct
    ? selected.reduce((s, id) => s + (stockById.get(id)?.unitCost ?? 0) * (Number(qty[id]) || 0), 0)
    : 0;
  const margin = priceNum - cost;

  const step1Valid = form.name.trim().length > 0 && form.price !== '' && Number.isFinite(priceNum) && priceNum >= 0;
  const step3Valid = selected.every((id) => (Number(qty[id]) || 0) > 0);
  const canFinish = step1Valid && (!isProduct || step3Valid);

  const save = useMutation({
    mutationFn: async () => {
      const body: CatalogItemInput = {
        name: form.name.trim(),
        categoryId: form.categoryId === '' ? null : Number(form.categoryId),
        ownStock: form.type === 'product' && form.ownStock,
        stockQuantity: form.type === 'product' && form.ownStock ? Number(form.stockQty) || 0 : null,
        type: form.type,
        price: priceNum,
        active: form.active,
        notes: form.notes.trim() || undefined,
      };
      if (editingId !== null) {
        await updateCatalogItem(companyId, editingId, body);
        if (isProduct) await setCatalogRecipe(companyId, editingId, { lines });
      } else {
        const created = await createCatalogItem(companyId, body);
        if (isProduct && lines.length) {
          try {
            await setCatalogRecipe(companyId, created.id, { lines });
          } catch {
            // Article créé mais recette échouée : on bascule en édition pour qu'un
            // nouvel essai modifie l'article existant au lieu d'en recréer un.
            setEditingId(created.id);
            invalidate();
            throw new Error('recipe_failed');
          }
        }
      }
    },
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
    onError: (e) =>
      toast(
        e instanceof Error && e.message === 'recipe_failed'
          ? "Article créé, mais l'enregistrement de la recette a échoué. Réessaie d'enregistrer."
          : "Échec de l'enregistrement de l'article.",
        'error',
      ),
  });

  const craftable = items.filter((it) => it.type === 'product' && it.stockItemId && it.recipe.length > 0);
  const [craftOpen, setCraftOpen] = useState(false);
  const [craftQty, setCraftQty] = useState<Record<number, number>>({});
  const bumpCraft = (id: number, d: number) =>
    setCraftQty((q) => ({ ...q, [id]: Math.max(0, Math.round(((q[id] ?? 0) + d) * 1000) / 1000) }));
  const craftLines = Object.entries(craftQty)
    .map(([id, n]) => ({ catalogItemId: Number(id), quantity: n }))
    .filter((l) => l.quantity > 0);

  const craft = useMutation({
    mutationFn: () => craftItems(companyId, craftLines),
    onSuccess: () => {
      setCraftOpen(false);
      setCraftQty({});
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['stocks', companyId] });
      toast('Craft effectué : stock mis à jour.', 'success');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'insufficient_stock') {
        toast('Matières premières insuffisantes pour ce craft.', 'error');
        return;
      }
      toast('Échec du craft.', 'error');
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCatalogItem(companyId, id),
    onSuccess: invalidate,
    onError: () => toast("Échec de la suppression de l'article.", 'error'),
  });

  const next = () => {
    if (step === 0 && !step1Valid) return;
    if (isLast) {
      if (canFinish) save.mutate();
    } else {
      setStep((s) => s + 1);
    }
  };

  const matMatches = (
    matSearch.trim()
      ? stocks.filter((s) => s.name.toLowerCase().includes(matSearch.trim().toLowerCase()))
      : stocks
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl border bg-card px-4 py-2">
          <span className="text-sm text-muted-foreground">Articles </span>
          <span className="font-semibold">{items.length}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canEdit && craftable.length > 0 && (
            <Button variant="outline" onClick={() => setCraftOpen(true)}>
              <Hammer className="h-4 w-4" />
              Craft
            </Button>
          )}
          {canDelete && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Nouvel article
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((it) => {
          const isOpen = expanded === it.id;
          const hasRecipe = it.type === 'product' && it.recipe.length > 0;
          return (
            <div key={it.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => hasRecipe && setExpanded((c) => (c === it.id ? null : it.id))}
                  aria-expanded={isOpen}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {hasRecipe ? (
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <span className="text-base font-semibold">{it.name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${it.type === 'product' ? 'bg-sky-500/10 text-sky-400' : 'bg-violet-500/10 text-violet-400'}`}>
                      {it.type === 'product' ? <Boxes className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                      {TYPE_LABEL[it.type]}
                    </span>
                    {it.categoryName && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{it.categoryName}</span>
                    )}
                    {!it.active && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">inactif</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                    <span>Prix <span className="font-semibold text-primary">{fmtMoney(it.price)} $</span></span>
                    {it.type === 'product' && (
                      <>
                        {it.productionCost !== null && <span>coût de fab. {fmtMoney(it.productionCost)} $</span>}
                        {it.margin !== null && (
                          <span className={it.margin >= 0 ? 'text-emerald-400' : 'text-destructive'}>marge {fmtMoney(it.margin)} $</span>
                        )}
                        <span>{it.recipe.length} matière(s)</span>
                      </>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  {canDelete && (
                    <button type="button" onClick={() => openEdit(it)} title="Modifier" aria-label={`Modifier ${it.name}`} className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: 'Supprimer cet article ?', message: it.name, destructive: true })) remove.mutate(it.id);
                      }}
                      title="Supprimer"
                      aria-label={`Supprimer ${it.name}`}
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {it.type === 'product' && canEdit && (
                <StockBar companyId={companyId} item={it} onDone={invalidate} />
              )}
              {isOpen && hasRecipe && (
                <div className="border-t px-4 pb-4 pt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Recette (par unité vendue)
                  </div>
                  <ul className="space-y-1 text-sm">
                    {it.recipe.map((r) => (
                      <li key={r.stockItemId} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {r.stockName} × {r.quantity.toLocaleString('fr-FR')} {r.unit ?? ''}
                        </span>
                        {r.lineCost !== null && <span className="text-xs text-muted-foreground">{fmtMoney(r.lineCost)} $</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <EmptyState
            icon={Boxes}
            title="Aucun article au catalogue"
            hint="Un article est ce que tu vends. Un produit se fabrique à partir de matières premières (sa recette) ; un service n'a pas de stock."
            action={
              canDelete ? (
                <Button variant="outline" onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Créer le premier article
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">{editingId !== null ? "Modifier l'article" : 'Nouvel article'}</h2>
              <button type="button" onClick={() => setOpen(false)} title="Fermer" aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b px-5 py-3">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className={`h-px w-5 ${i <= step ? 'bg-primary' : 'bg-border'}`} />}
                  <div className={`flex items-center gap-2 ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary/15 text-primary' : 'bg-muted'}`}>
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="hidden text-xs font-medium sm:inline">{s}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {step === 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">
                    <span className={labelCls}>Nom de l'article</span>
                    <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="ex. Cola" />
                  </label>
                  <label className="text-sm">
                    <span className={labelCls}>Type</span>
                    <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value as CatalogItemType)}>
                      {CATALOG_ITEM_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className={labelCls}>Catégorie</span>
                    <select className={inputCls} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value === '' ? '' : Number(e.target.value))}>
                      <option value="">— aucune —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className={labelCls}>Prix de vente ($)</span>
                    <input type="number" step="0.01" min="0" className={inputCls} value={form.price} onChange={(e) => set('price', e.target.value)} />
                  </label>
                  <label className="flex items-center gap-2 text-sm sm:pt-6">
                    <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={form.active} onChange={() => set('active', !form.active)} />
                    <span>Actif (vendable)</span>
                  </label>
                  {isProduct && (
                    <div className="rounded-lg border p-3 sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-primary"
                          checked={form.ownStock}
                          onChange={() => set('ownStock', !form.ownStock)}
                        />
                        <span className="font-medium">Ce produit a son propre stock</span>
                      </label>
                      {form.ownStock && (
                        <label className="mt-3 block text-sm">
                          <span className={labelCls}>Quantité en stock</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={`${inputCls} sm:w-48`}
                            value={form.stockQty}
                            onChange={(e) => set('stockQty', e.target.value)}
                            placeholder="0"
                            disabled={editingId !== null}
                          />
                          {editingId !== null && (
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              La quantité se modifie via les mouvements de stock.
                            </span>
                          )}
                        </label>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sa quantité baisse à chaque vente, même sans matière première. Un article de stock dédié est
                        géré automatiquement. Combiné à une recette (étapes suivantes), le produit devient « craftable ».
                      </p>
                    </div>
                  )}
                  <label className="text-sm sm:col-span-2">
                    <span className={labelCls}>Notes</span>
                    <textarea className={`${inputCls} h-16 py-2`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                  </label>
                  <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">
                    {isProduct ? (
                      <>Un <b className="text-foreground">produit</b> se fabrique à partir de matières premières (étapes suivantes). À la vente, ses matières sont décomptées du stock.</>
                    ) : (
                      <>Un <b className="text-foreground">service</b> (ex. réparation custom) n'a pas de stock ni de recette — tu peux le créer directement.</>
                    )}
                  </p>
                </div>
              )}

              {step === 1 && isProduct && (
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">Coche les matières premières qui composent « {form.name || 'cet article'} ».</p>
                  {!stocksVisible ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Le module Stocks n'est pas accessible — l'article sera créé sans recette.
                    </div>
                  ) : stocks.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Aucune matière première. Crée-en d'abord dans l'onglet « Matières premières ».
                    </div>
                  ) : (
                    <>
                      <div className="relative mb-3">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input className={`${inputCls} pl-8`} value={matSearch} onChange={(e) => setMatSearch(e.target.value)} placeholder="Rechercher une matière première…" aria-label="Rechercher une matière première" />
                      </div>
                      <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                        {matMatches.length === 0 ? (
                          <div className="px-2 py-3 text-sm text-muted-foreground">Aucune matière trouvée.</div>
                        ) : (
                          matMatches.map((s) => {
                            const checked = selected.includes(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleMat(s.id)}
                                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${checked ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                              >
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                                  {checked && <Check className="h-3.5 w-3.5" />}
                                </span>
                                <span className="flex-1 truncate font-medium">{s.name}</span>
                                <span className="text-xs text-muted-foreground">{fmtMoney(s.unitCost)} $ / {s.unit}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{selected.length} matière(s) sélectionnée(s).</p>
                    </>
                  )}
                </div>
              )}

              {step === 2 && isProduct && (
                <div>
                  {selected.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Aucune matière première.{' '}
                      {form.ownStock
                        ? 'Ce produit utilise son propre stock (défini à l’étape Article) : sa quantité baissera à chaque vente.'
                        : 'Ce produit n’a ni recette ni stock propre — coche « stock propre » à l’étape Article si tu veux suivre son stock.'}
                    </div>
                  ) : (
                    <>
                      <p className="mb-3 text-sm text-muted-foreground">Quantité de chaque matière consommée par unité vendue.</p>
                      <div className="space-y-2">
                        {selected.map((id) => {
                          const s = stockById.get(id);
                          const q = Number(qty[id]) || 0;
                          return (
                            <div key={id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
                              <span className="min-w-[8rem] flex-1 truncate text-sm font-medium">{s?.name ?? '—'}</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                className={`${inputCls} w-28`}
                                value={qty[id] ?? ''}
                                onChange={(e) => setQty((qq) => ({ ...qq, [id]: e.target.value.replace(',', '.').replace(/[^0-9.]/g, '') }))}
                                placeholder="ex. 0.1"
                              />
                              <span className="text-xs text-muted-foreground">{s?.unit ?? ''}</span>
                              <span className="w-24 text-right text-xs text-muted-foreground">{fmtMoney((s?.unitCost ?? 0) * q)} $</span>
                              <button type="button" onClick={() => toggleMat(id)} aria-label="Retirer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {!step3Valid && <p className="mt-2 text-xs text-amber-400">Mets une quantité supérieure à 0 pour chaque matière (ou retire-la).</p>}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                        <span className="text-muted-foreground">
                          Coût de fabrication <span className="font-semibold text-foreground">{fmtMoney(cost)} $</span>
                        </span>
                        <span className="text-muted-foreground">
                          Marge <span className={`font-semibold ${margin >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>{fmtMoney(margin)} $</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
              <Button type="button" variant="ghost" onClick={() => (step === 0 ? setOpen(false) : setStep((s) => s - 1))}>
                {step === 0 ? (
                  'Annuler'
                ) : (
                  <>
                    <ArrowLeft className="h-4 w-4" />
                    Précédent
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={next}
                disabled={(step === 0 && !step1Valid) || (isLast && (!canFinish || save.isPending))}
              >
                {isLast ? (
                  save.isPending ? 'Enregistrement…' : editingId !== null ? 'Enregistrer' : "Créer l'article"
                ) : (
                  <>
                    Suivant
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {craftOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <Hammer className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Craft — fabriquer des produits</h2>
              </div>
              <button type="button" onClick={() => setCraftOpen(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-5">
              <p className="mb-2 text-sm text-muted-foreground">
                Indique combien d'unités tu fabriques. Les matières premières sont retirées du stock, le produit fini y est ajouté.
              </p>
              {craftable.map((it) => {
                const n = craftQty[it.id] ?? 0;
                return (
                  <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Stock actuel : {it.stockQuantity ?? 0} · consomme {it.recipe.map((r) => `${r.quantity} ${r.stockName}`).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => bumpCraft(it.id, -1)} aria-label="Moins" className="grid h-8 w-8 place-items-center rounded-md border border-input text-muted-foreground hover:bg-accent">
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={n === 0 ? '' : n}
                        onChange={(e) => setCraftQty((q) => ({ ...q, [it.id]: Math.max(0, Number(e.target.value) || 0) }))}
                        placeholder="0"
                        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button type="button" onClick={() => bumpCraft(it.id, 1)} aria-label="Plus" className="grid h-8 w-8 place-items-center rounded-md border border-input text-muted-foreground hover:bg-accent">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
              <span className="text-xs text-muted-foreground">
                {craftLines.length === 0 ? 'Aucune quantité saisie' : `${craftLines.length} produit(s) à fabriquer`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCraftOpen(false)}>Annuler</Button>
                <Button onClick={() => craft.mutate()} disabled={craftLines.length === 0 || craft.isPending}>
                  <Hammer className="h-4 w-4" />
                  {craft.isPending ? 'Craft…' : 'Lancer le craft'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockBar({
  companyId,
  item,
  onDone,
}: {
  companyId: number;
  item: CatalogItem;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('1');
  const adjust = useMutation({
    mutationFn: (delta: number) => adjustCatalogStock(companyId, item.id, delta),
    onSuccess: onDone,
    onError: (e) =>
      toast(
        e instanceof ApiError && e.code === 'insufficient_stock'
          ? 'Stock insuffisant pour retirer autant.'
          : 'Échec de l’ajustement du stock.',
        'error',
      ),
  });
  const n = Math.max(0, Number(amount) || 0);
  const hasStock = item.stockItemId != null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
      <span className="text-xs text-muted-foreground">Stock</span>
      <span className={`text-sm font-semibold ${!hasStock ? 'text-muted-foreground' : (item.stockQuantity ?? 0) > 0 ? 'text-foreground' : 'text-destructive'}`}>
        {hasStock ? (item.stockQuantity ?? 0) : '—'}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-sm outline-none focus:ring-1 focus:ring-ring"
          aria-label={`Quantité à ajuster pour ${item.name}`}
        />
        <button
          type="button"
          onClick={() => n > 0 && adjust.mutate(n)}
          disabled={n <= 0 || adjust.isPending}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
        <button
          type="button"
          onClick={() => n > 0 && adjust.mutate(-n)}
          disabled={n <= 0 || adjust.isPending || !hasStock}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
        >
          <Minus className="h-3.5 w-3.5" />
          Retirer
        </button>
      </div>
    </div>
  );
}
