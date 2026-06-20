import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, ChevronDown, Boxes, Wrench } from 'lucide-react';
import { CATALOG_ITEM_TYPES, moduleConfigBool, type CatalogItemType } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/declarations';
import { useModulePerms } from '@/lib/useCompany';
import { SalesView } from '@/components/SalesView';
import {
  getCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  setCatalogRecipe,
  type CatalogItem,
  type CatalogItemInput,
  type CatalogStock,
} from '@/lib/catalog';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const TYPE_LABEL: Record<string, string> = Object.fromEntries(CATALOG_ITEM_TYPES.map((t) => [t.key, t.label]));

const EMPTY = {
  name: '',
  category: '',
  type: 'product' as CatalogItemType,
  price: '',
  active: true,
  notes: '',
};

export default function Caisse() {
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('caisse');
  const cfg = company?.modules.find((m) => m.key === 'caisse')?.config;
  const clientLink = moduleConfigBool(cfg, 'caisse', 'clients');
  const discountAllowed = moduleConfigBool(cfg, 'caisse', 'discount');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'catalog' | 'sales'>('catalog');

  const q = useQuery({ queryKey: ['catalog', companyId], queryFn: () => getCatalog(companyId) });

  const [expanded, setExpanded] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['catalog', companyId] });

  const create = useMutation({
    mutationFn: (body: CatalogItemInput) => createCatalogItem(companyId, body),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: CatalogItemInput }) => updateCatalogItem(companyId, v.id, v.body),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteCatalogItem(companyId, id),
    onSuccess: invalidate,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };
  const openEdit = (it: CatalogItem) => {
    setEditing(it.id);
    setForm({
      name: it.name,
      category: it.category ?? '',
      type: it.type,
      price: String(it.price),
      active: it.active,
      notes: it.notes ?? '',
    });
    setOpen(true);
  };

  const priceNum = Number(form.price);
  const valid = form.name.trim().length > 0 && form.price !== '' && Number.isFinite(priceNum) && priceNum >= 0;
  const submit = () => {
    const body: CatalogItemInput = {
      name: form.name.trim(),
      category: form.category.trim() || undefined,
      type: form.type,
      price: priceNum,
      active: form.active,
      notes: form.notes.trim() || undefined,
    };
    if (editing !== null) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const items = q.data?.items ?? [];
  const stocks = q.data?.stockItems ?? [];
  const stocksVisible = q.data?.stocksVisible ?? false;
  const products = items.filter((i) => i.type === 'product').length;
  const services = items.length - products;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setTab('catalog')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'catalog' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Catalogue
        </button>
        <button
          type="button"
          onClick={() => setTab('sales')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'sales' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Ventes
        </button>
      </div>

      {tab === 'sales' ? (
        <SalesView
          companyId={companyId}
          companyName={company?.company.name ?? 'Entreprise'}
          catalogItems={items}
          canCreate={canCreate}
          canDelete={canDelete}
          clientLink={clientLink}
          discountAllowed={discountAllowed}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-3">
              <div className="rounded-lg border bg-card px-4 py-2">
                <span className="text-sm text-muted-foreground">Articles </span>
                <span className="font-semibold">{items.length}</span>
              </div>
              <div className="rounded-lg border bg-card px-4 py-2">
                <span className="text-sm text-muted-foreground">Produits / services </span>
                <span className="font-semibold">
                  {products} / {services}
                </span>
              </div>
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
              const isOpen = expanded === it.id;
              return (
                <div key={it.id} className="rounded-xl border bg-card">
                  <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => setExpanded((c) => (c === it.id ? null : it.id))}
                      aria-expanded={isOpen}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {it.type === 'product' && (
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                              isOpen ? '' : '-rotate-90'
                            }`}
                          />
                        )}
                        <span className={`text-base font-semibold ${it.type !== 'product' ? 'pl-6' : ''}`}>
                          {it.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                            it.type === 'product'
                              ? 'bg-sky-500/10 text-sky-400'
                              : 'bg-violet-500/10 text-violet-400'
                          }`}
                        >
                          {it.type === 'product' ? <Boxes className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                          {TYPE_LABEL[it.type]}
                        </span>
                        {it.category && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {it.category}
                          </span>
                        )}
                        {!it.active && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            inactif
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                        <span>
                          Prix <span className="font-semibold text-primary">{fmtMoney(it.price)} $</span>
                        </span>
                        {it.type === 'product' && (
                          <>
                            {it.productionCost !== null && <span>coût {fmtMoney(it.productionCost)} $</span>}
                            {it.margin !== null && (
                              <span className={it.margin >= 0 ? 'text-emerald-400' : 'text-destructive'}>
                                marge {fmtMoney(it.margin)} $
                              </span>
                            )}
                            <span>{it.recipe.length} composant(s)</span>
                          </>
                        )}
                      </div>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEdit(it)}
                          title="Modifier"
                          className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Supprimer l'article « ${it.name} » ?`)) remove.mutate(it.id);
                          }}
                          title="Supprimer"
                          className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && it.type === 'product' && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <RecipeEditor
                        key={`${it.id}:${it.recipe.map((r) => `${r.stockItemId}x${r.quantity}`).join(',')}`}
                        item={it}
                        stocks={stocks}
                        companyId={companyId}
                        editable={canEdit && stocksVisible}
                        stocksVisible={stocksVisible}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
                <p className="text-sm text-muted-foreground">Aucun article au catalogue.</p>
                {canCreate && (
                  <Button variant="outline" onClick={openNew}>
                    <Plus className="h-4 w-4" />
                    Créer le premier article
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">{editing !== null ? "Modifier l'article" : 'Nouvel article'}</h2>
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
                  <span className={labelCls}>Type</span>
                  <select
                    className={inputCls}
                    value={form.type}
                    onChange={(e) => set('type', e.target.value as CatalogItemType)}
                  >
                    {CATALOG_ITEM_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
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
                  <span className={labelCls}>Prix de vente ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm sm:pt-6">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={form.active}
                    onChange={() => set('active', !form.active)}
                  />
                  <span>Actif (vendable)</span>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Notes</span>
                  <textarea
                    className={`${inputCls} h-20 py-2`}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Un <b>produit</b> peut avoir une recette de composants (décrémentés du stock à la vente). Un{' '}
                <b>service</b> n'a pas de stock (ex. réparation custom).
              </p>
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
    </div>
  );
}

function RecipeEditor({
  item,
  stocks,
  companyId,
  editable,
  stocksVisible,
}: {
  item: CatalogItem;
  stocks: CatalogStock[];
  companyId: number;
  editable: boolean;
  stocksVisible: boolean;
}) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<{ stockItemId: number; quantity: string }[]>(
    item.recipe.map((r) => ({ stockItemId: r.stockItemId, quantity: String(r.quantity) })),
  );

  const save = useMutation({
    mutationFn: () =>
      setCatalogRecipe(companyId, item.id, {
        lines: lines
          .filter((l) => l.stockItemId > 0 && Number(l.quantity) > 0)
          .map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity) })),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog', companyId] }),
    onError: () => alert("Échec de l'enregistrement de la recette (composant en double ou invalide ?)."),
  });

  const stockById = new Map(stocks.map((s) => [s.id, s]));
  const used = new Set(lines.map((l) => l.stockItemId));
  const incomplete = lines.some((l) => (l.stockItemId > 0) !== (Number(l.quantity) > 0));
  const cost = lines.reduce((sum, l) => {
    const s = stockById.get(l.stockItemId);
    return sum + (s ? s.unitCost * (Number(l.quantity) || 0) : 0);
  }, 0);
  const margin = item.price - cost;

  const addLine = () => setLines((ls) => [...ls, { stockItemId: 0, quantity: '' }]);
  const setLine = (i: number, patch: Partial<{ stockItemId: number; quantity: string }>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  if (!stocksVisible) {
    return (
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recette
        </div>
        {item.recipe.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun composant.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {item.recipe.map((r) => (
              <li key={r.stockItemId} className="text-muted-foreground">
                {r.stockName} × {r.quantity.toLocaleString('fr-FR')} {r.unit ?? ''}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Les coûts et l'édition de la recette nécessitent l'accès au module Stocks.
        </p>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun article en stock à lier. Crée d'abord des articles dans le module Stocks.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Recette (composants consommés par unité vendue)
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const s = stockById.get(l.stockItemId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className={`${inputCls} max-w-xs`}
                value={l.stockItemId}
                onChange={(e) => setLine(i, { stockItemId: Number(e.target.value) })}
                disabled={!editable}
              >
                <option value={0}>— composant —</option>
                {stocks.map((st) => (
                  <option key={st.id} value={st.id} disabled={used.has(st.id) && st.id !== l.stockItemId}>
                    {st.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.001"
                min="0"
                className={`${inputCls} w-28`}
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                placeholder="quantité"
                disabled={!editable}
              />
              {s && <span className="text-xs text-muted-foreground">{s.unit} · {fmtMoney(s.unitCost)} $/u</span>}
              {editable && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {lines.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun composant — c'est un produit sans stock.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Coût de production <span className="font-semibold text-foreground">{fmtMoney(cost)} $</span> · marge{' '}
          <span className={`font-semibold ${margin >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
            {fmtMoney(margin)} $
          </span>
        </div>
        {editable && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4" />
                Composant
              </Button>
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || incomplete}>
                {save.isPending ? 'Enregistrement…' : 'Enregistrer la recette'}
              </Button>
            </div>
            {incomplete && (
              <span className="text-[11px] text-amber-400">
                Complète (composant + quantité) ou retire les lignes incomplètes.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
