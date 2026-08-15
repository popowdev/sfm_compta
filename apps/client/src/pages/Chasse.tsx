import { useState } from 'react';
import { useCompany, useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, Trash2, ArrowDownLeft, ArrowUpRight, Boxes, Coins, TrendingUp, Warehouse, X, MoreVertical, Search } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getChasseOverview, getChasseTransactions,
  addChasseItem, updateChasseItem, deleteChasseItem,
  addChasseBuy, addChasseSell, deleteChasseTx,
  type ChasseItem, type ChasseTx,
} from '@/lib/chasse';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtInt(n)} $`;
const fmtDay = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

type Tab = 'stock' | 'buys' | 'sells' | 'catalog';

export default function Chasse() {
  const { companyId, isLoading } = useCompany();
  const canManage = useModulePerms('chasse').canDelete;
  const [tab, setTab] = useState<Tab>('stock');
  const q = useQuery({ queryKey: ['chasse', companyId, 'overview'], queryFn: () => getChasseOverview(companyId), enabled: !!companyId });

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={Target} title="Chasse" hint="Module indisponible." />;

  const { items, summary, canWrite } = q.data;
  const s = summary;

  const TabBtn = ({ k, label, icon: Icon }: { k: Tab; label: string; icon: typeof Target }) => (
    <button type="button" onClick={() => setTab(k)}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={ArrowDownLeft} label="Total racheté (chasseur)" value={money(s.totalBuy)} sub={`${s.buyCount} rachat${s.buyCount > 1 ? 's' : ''}`} accent="text-amber-400" />
        <Kpi icon={ArrowUpRight} label="Total revendu (grossiste)" value={money(s.totalSell)} sub={`${s.sellCount} revente${s.sellCount > 1 ? 's' : ''}`} accent="text-emerald-400" />
        <Kpi icon={TrendingUp} label="Marge réalisée" value={money(s.margin)} sub="revendu − racheté" accent={s.margin >= 0 ? 'text-emerald-400' : 'text-destructive'} />
        <Kpi icon={Warehouse} label="Valeur du stock" value={money(s.stockValue)} sub={`${s.stockUnits} unité${s.stockUnits > 1 ? 's' : ''} · ${s.itemsInStock} produit${s.itemsInStock > 1 ? 's' : ''}`} accent="text-sky-400" />
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1">
        <TabBtn k="stock" label="Stock" icon={Boxes} />
        <TabBtn k="buys" label="Rachat chasseur" icon={ArrowDownLeft} />
        <TabBtn k="sells" label="Revente grossiste" icon={ArrowUpRight} />
        <TabBtn k="catalog" label="Catalogue" icon={Coins} />
      </div>

      {tab === 'stock' && <StockTab items={items} />}
      {tab === 'buys' && <TransactionsTab companyId={companyId} type="buy" items={items} canWrite={canWrite} />}
      {tab === 'sells' && <TransactionsTab companyId={companyId} type="sell" items={items} canWrite={canWrite} />}
      {tab === 'catalog' && <CatalogTab companyId={companyId} items={items} canManage={canManage} />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: typeof Target; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${accent}`} /> {label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function StockTab({ items }: { items: ChasseItem[] }) {
  const [q, setQ] = useState('');
  const rows = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Stock en réserve</h3>
          <p className="text-xs text-muted-foreground">Ce qui a été racheté et qu'il reste à revendre au grossiste.</p>
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={`${inputCls} w-56 pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit…" /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left font-semibold">Produit</th>
              <th className="py-2 text-right font-semibold">Stock</th>
              <th className="py-2 text-right font-semibold">Prix rachat</th>
              <th className="py-2 text-right font-semibold">Prix revente</th>
              <th className="py-2 text-right font-semibold">Valeur (revente)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id} className={`border-b last:border-b-0 ${it.stock <= 0 ? 'opacity-50' : ''}`}>
                <td className="py-2 font-medium">
                  {it.name}
                  {it.venteClient && <span className="ml-2 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">vente client</span>}
                  {!it.active && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">inactif</span>}
                </td>
                <td className={`py-2 text-right font-semibold ${it.stock > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{it.stock}</td>
                <td className="py-2 text-right text-muted-foreground">{money(it.buyPrice)}</td>
                <td className="py-2 text-right text-muted-foreground">{money(it.sellPrice)}</td>
                <td className="py-2 text-right text-emerald-400">{it.stock > 0 ? money(it.stockValue) : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Aucun produit. Ajoute-les dans l'onglet « Catalogue ».</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionsTab({ companyId, type, items, canWrite }: { companyId: number; type: 'buy' | 'sell'; items: ChasseItem[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(false);
  const list = useQuery({ queryKey: ['chasse', companyId, 'tx', type], queryFn: () => getChasseTransactions(companyId, type) });
  const inv = () => { queryClient.invalidateQueries({ queryKey: ['chasse', companyId, 'tx', type] }); queryClient.invalidateQueries({ queryKey: ['chasse', companyId, 'overview'] }); };
  const del = useMutation({ mutationFn: (id: number) => deleteChasseTx(companyId, id), onSuccess: inv, onError: () => toast('Suppression impossible (stock négatif ?).', 'error') });
  const txs = list.data?.transactions ?? [];
  const isBuy = type === 'buy';
  const totalShown = txs.reduce((a, t) => a + t.total, 0);

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{isBuy ? 'Rachats aux chasseurs' : 'Reventes au grossiste'}</h3>
          <p className="text-xs text-muted-foreground">{isBuy ? "Produits rachetés à un chasseur (sort du cash, entre en stock)." : 'Stock revendu au grossiste (entre du cash, sort du stock).'} · Total : <span className={isBuy ? 'text-amber-400' : 'text-emerald-400'}>{money(totalShown)}</span></p>
        </div>
        {canWrite && items.length > 0 && <Button onClick={() => setModal(true)}><Plus className="h-4 w-4" /> {isBuy ? 'Nouveau rachat' : 'Nouvelle revente'}</Button>}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Coins} title="Catalogue vide" hint="Ajoute d'abord tes produits de chasse dans l'onglet « Catalogue »." />
      ) : txs.length === 0 ? (
        <EmptyState icon={isBuy ? ArrowDownLeft : ArrowUpRight} title={isBuy ? 'Aucun rachat' : 'Aucune revente'} hint={isBuy ? 'Enregistre un premier rachat chasseur.' : 'Revends du stock au grossiste.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-semibold">Date</th>
                <th className="py-2 text-left font-semibold">Produit</th>
                {isBuy && <th className="py-2 text-left font-semibold">Chasseur</th>}
                <th className="py-2 text-right font-semibold">Qté</th>
                <th className="py-2 text-right font-semibold">Prix unit.</th>
                <th className="py-2 text-right font-semibold">Total</th>
                <th className="py-2 text-left font-semibold">Par</th>
                {canWrite && <th className="py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b last:border-b-0">
                  <td className="py-2 text-muted-foreground">{fmtDay(t.createdAt)}</td>
                  <td className="py-2 font-medium">{t.itemName ?? '—'}</td>
                  {isBuy && <td className="py-2 text-muted-foreground">{t.clientName || '—'}</td>}
                  <td className="py-2 text-right">{t.qty}</td>
                  <td className="py-2 text-right text-muted-foreground">{money(t.unitPrice)}</td>
                  <td className={`py-2 text-right font-semibold ${isBuy ? 'text-amber-400' : 'text-emerald-400'}`}>{money(t.total)}</td>
                  <td className="py-2 text-xs text-muted-foreground">{t.authorName ?? '—'}</td>
                  {canWrite && <td className="py-2 text-right"><button type="button" onClick={async () => { if (await confirm({ title: 'Annuler cette écriture ?', message: `${t.itemName} · ${money(t.total)}`, destructive: true })) del.mutate(t.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <TxModal companyId={companyId} type={type} items={items} onClose={() => setModal(false)} onSaved={inv} />}
    </div>
  );
}

function TxModal({ companyId, type, items, onClose, onSaved }: { companyId: number; type: 'buy' | 'sell'; items: ChasseItem[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isBuy = type === 'buy';
  const available = items.filter((i) => i.active && (isBuy || i.stock > 0));
  const [itemId, setItemId] = useState<number | ''>('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [client, setClient] = useState('');
  const [note, setNote] = useState('');
  const sel = items.find((i) => i.id === itemId);

  const pickItem = (id: number | '') => {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    if (it) setPrice(String(isBuy ? it.buyPrice : it.sellPrice));
  };

  const qtyN = Math.max(1, Math.floor(Number(qty) || 1));
  const priceN = Math.max(0, Math.round(Number(price) || 0));
  const total = qtyN * priceN;
  const overStock = !isBuy && sel ? qtyN > sel.stock : false;
  const valid = itemId !== '' && qtyN >= 1 && priceN >= 0 && !overStock;

  const save = useMutation({
    mutationFn: () => {
      const body = { itemId: itemId as number, qty: qtyN, unitPrice: priceN, clientName: isBuy ? client.trim() || undefined : undefined, note: note.trim() || undefined };
      return isBuy ? addChasseBuy(companyId, body) : addChasseSell(companyId, body);
    },
    onSuccess: () => { toast(isBuy ? 'Rachat enregistré.' : 'Revente enregistrée.', 'success'); onSaved(); onClose(); },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });

  return (
    <ModalShell title={isBuy ? 'Nouveau rachat chasseur' : 'Nouvelle revente grossiste'} onClose={onClose}>
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Produit</span>
          <select className={inputCls} value={itemId} onChange={(e) => pickItem(e.target.value ? Number(e.target.value) : '')} autoFocus>
            <option value="">Sélectionner un produit…</option>
            {available.map((i) => <option key={i.id} value={i.id}>{i.name}{isBuy ? '' : ` (stock ${i.stock})`}</option>)}
          </select>
        </label>
        {!isBuy && sel && <div className="text-xs text-muted-foreground">Stock disponible : <span className="font-medium text-foreground">{sel.stock}</span></div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Quantité</span><input type="number" min="1" step="1" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix unitaire {isBuy ? '(rachat)' : '(revente)'}</span><input type="number" min="0" step="1" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        </div>
        {isBuy && <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Chasseur (optionnel)</span><input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nom du chasseur" /></label>}
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Note (optionnel)</span><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {overStock && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">Quantité supérieure au stock disponible ({sel?.stock}).</div>}
        <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isBuy ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10'}`}>
          <span className="text-xs text-muted-foreground">{isBuy ? 'À payer au chasseur' : 'Encaissé du grossiste'}</span>
          <span className={`text-xl font-bold ${isBuy ? 'text-amber-400' : 'text-emerald-400'}`}>{money(total)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function CatalogTab({ companyId, items, canManage }: { companyId: number; items: ChasseItem[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ edit: ChasseItem | null } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const inv = () => queryClient.invalidateQueries({ queryKey: ['chasse', companyId, 'overview'] });
  const toggle = useMutation({ mutationFn: (v: { id: number; active: boolean }) => updateChasseItem(companyId, v.id, { active: v.active }), onSuccess: inv, onError: () => toast('Échec.', 'error') });
  const del = useMutation({ mutationFn: (id: number) => deleteChasseItem(companyId, id), onSuccess: () => { toast('Produit supprimé.', 'success'); inv(); }, onError: () => toast('Suppression impossible (produit utilisé dans des écritures).', 'error') });
  const rows = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Liste des produits de chasse</h3>
          <p className="text-xs text-muted-foreground">Prix de rachat (au chasseur) et de revente (au grossiste) par produit. À toi de créer tes produits.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={`${inputCls} w-52 pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          {canManage && <Button onClick={() => setModal({ edit: null })}><Plus className="h-4 w-4" /> Ajouter un produit</Button>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left font-semibold">Nom du produit</th>
              <th className="py-2 text-right font-semibold">Prix rachat (base)</th>
              <th className="py-2 text-right font-semibold">Prix revente (grossiste)</th>
              <th className="py-2 text-center font-semibold">Vente client</th>
              <th className="py-2 text-center font-semibold">Statut</th>
              {canManage && <th className="py-2 text-center font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id} className="border-b last:border-b-0">
                <td className="py-2.5 font-medium">{it.name}</td>
                <td className="py-2.5 text-right">{money(it.buyPrice)}</td>
                <td className="py-2.5 text-right">{money(it.sellPrice)}</td>
                <td className="py-2.5 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] ${it.venteClient ? 'bg-sky-500/15 text-sky-300' : 'bg-muted text-muted-foreground'}`}>{it.venteClient ? 'OUI' : 'NON'}</span></td>
                <td className="py-2.5 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] ${it.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{it.active ? 'ACTIF' : 'INACTIF'}</span></td>
                {canManage && (
                  <td className="py-2.5 text-center">
                    <div className="relative inline-block">
                      <button type="button" onClick={() => setMenu(menu === it.id ? null : it.id)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"><MoreVertical className="h-4 w-4" /></button>
                      {menu === it.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border bg-popover p-1 text-sm shadow-lg">
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => { setMenu(null); setModal({ edit: it }); }}>Modifier</button>
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => { setMenu(null); toggle.mutate({ id: it.id, active: !it.active }); }}>{it.active ? 'Désactiver' : 'Activer'}</button>
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10" onClick={async () => { setMenu(null); if (await confirm({ title: 'Supprimer ce produit ?', message: it.name, destructive: true })) del.mutate(it.id); }}>Supprimer</button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={canManage ? 6 : 5} className="py-6 text-center text-sm text-muted-foreground">Aucun produit. Clique sur « Ajouter un produit » pour créer ta liste.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && <ItemModal companyId={companyId} edit={modal.edit} onClose={() => setModal(null)} onSaved={inv} />}
    </div>
  );
}

function ItemModal({ companyId, edit, onClose, onSaved }: { companyId: number; edit: ChasseItem | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [buy, setBuy] = useState(edit ? String(edit.buyPrice) : '');
  const [sell, setSell] = useState(edit ? String(edit.sellPrice) : '');
  const [vc, setVc] = useState(edit?.venteClient ?? false);
  const valid = name.trim().length > 0;
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), buyPrice: Math.max(0, Math.round(Number(buy) || 0)), sellPrice: Math.max(0, Math.round(Number(sell) || 0)), venteClient: vc };
      return edit ? updateChasseItem(companyId, edit.id, body) : addChasseItem(companyId, body);
    },
    onSuccess: () => { toast(edit ? 'Produit modifié.' : 'Produit ajouté.', 'success'); onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  return (
    <ModalShell title={edit ? 'Modifier le produit' : 'Ajouter un produit'} onClose={onClose}>
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Nom du produit</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix rachat (chasseur)</span><input type="number" min="0" step="1" className={inputCls} value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="0" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix revente (grossiste)</span><input type="number" min="0" step="1" className={inputCls} value={sell} onChange={(e) => setSell(e.target.value)} placeholder="0" /></label>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-background/50 p-3 text-sm">
          <span><span className="font-medium">Vente client</span><span className="block text-xs text-muted-foreground">Produit vendu directement au client — géré via la caisse.</span></span>
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={vc} onChange={(e) => setVc(e.target.checked)} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
