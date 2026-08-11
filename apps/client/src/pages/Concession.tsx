import { useMemo, useState } from 'react';
import { useCompany } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CarFront, Plus, Trash2, Boxes, Receipt, TrendingUp, Coins, X, MoreVertical, Search, ExternalLink, Copy, RefreshCw, Tag } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getConcessionOverview, getConcessionSales,
  addVehicle, updateVehicle, deleteVehicle,
  addSale, deleteSale, regenerateShowroomToken,
  type ConcessionVehicle, type ConcessionSale, type ConcessionShowroom, type VehicleType,
} from '@/lib/concession';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtInt(n)} $`;
const fmtDay = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

type Tab = 'catalogue' | 'ventes';

export default function Concession() {
  const { companyId, isLoading } = useCompany();
  const [tab, setTab] = useState<Tab>('catalogue');
  const q = useQuery({ queryKey: ['concession', companyId, 'overview'], queryFn: () => getConcessionOverview(companyId), enabled: !!companyId });

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={CarFront} title="Concession auto" hint="Module indisponible." />;

  const { vehicles, summary, canWrite, showroom } = q.data;
  const s = summary;

  const TabBtn = ({ k, label, icon: Icon }: { k: Tab; label: string; icon: typeof CarFront }) => (
    <button type="button" onClick={() => setTab(k)}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Boxes} label="Catalogue" value={`${s.catalogSize}`} sub={`${s.availableCount} dispo · valeur ${money(s.catalogValue)}`} accent="text-sky-400" />
        <Kpi icon={Receipt} label="CA ventes" value={money(s.revenue)} sub={`${s.salesCount} vente${s.salesCount > 1 ? 's' : ''}`} accent="text-emerald-400" />
        <Kpi icon={TrendingUp} label="Marge réalisée" value={money(s.margin)} sub="vente − achat" accent={s.margin >= 0 ? 'text-emerald-400' : 'text-destructive'} />
        <Kpi icon={Coins} label="Commissions versées" value={money(s.commissionsPaid)} sub="aux vendeurs" accent="text-amber-400" />
      </div>

      {canWrite && <ShowroomBanner companyId={companyId} showroom={showroom} />}

      <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1">
        <TabBtn k="catalogue" label="Catalogue" icon={Boxes} />
        <TabBtn k="ventes" label="Ventes" icon={Receipt} />
      </div>

      {tab === 'catalogue' && <CatalogueTab companyId={companyId} vehicles={vehicles} canWrite={canWrite} />}
      {tab === 'ventes' && <VentesTab companyId={companyId} vehicles={vehicles} canWrite={canWrite} />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: typeof CarFront; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${accent}`} /> {label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function ShowroomBanner({ companyId, showroom }: { companyId: number; showroom: ConcessionShowroom }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const url = showroom.token ? `${window.location.origin}/showroom/${showroom.token}` : '';
  const regen = useMutation({
    mutationFn: () => regenerateShowroomToken(companyId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['concession', companyId, 'overview'] }); toast('Nouveau lien généré. L\'ancien ne fonctionne plus.', 'success'); },
    onError: () => toast('Échec.', 'error'),
  });

  if (!showroom.enabled) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card p-4 text-sm">
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <div className="font-medium">Vitrine publique désactivée</div>
          <div className="text-xs text-muted-foreground">Active « Vitrine publique » dans les réglages du module pour obtenir un lien de catalogue partageable.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <ExternalLink className="h-4 w-4 text-emerald-400" />
          <span className="font-medium">Vitrine publique en ligne</span>
        </div>
        <div className="flex items-center gap-2">
          {url && <a href={url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4" /> Ouvrir</Button></a>}
          {url && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(url); toast('Lien copié.', 'success'); }}><Copy className="h-4 w-4" /> Copier</Button>}
          <Button size="sm" variant="outline" disabled={regen.isPending}
            onClick={async () => { if (await confirm({ title: 'Régénérer le lien ?', message: 'L\'ancien lien cessera de fonctionner immédiatement.', destructive: true })) regen.mutate(); }}>
            <RefreshCw className="h-4 w-4" /> Régénérer
          </Button>
        </div>
      </div>
      {url && <div className="mt-2 truncate rounded-md bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">{url}</div>}
    </div>
  );
}

function TypeBadge({ type }: { type: VehicleType }) {
  return type === 'used'
    ? <span className="rounded px-1.5 py-0.5 text-[10px] bg-amber-500/15 text-amber-300">Occasion</span>
    : <span className="rounded px-1.5 py-0.5 text-[10px] bg-sky-500/15 text-sky-300">Neuf</span>;
}

function CatalogueTab({ companyId, vehicles, canWrite }: { companyId: number; vehicles: ConcessionVehicle[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [modal, setModal] = useState<{ edit: ConcessionVehicle | null } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const categories = useMemo(() => [...new Set(vehicles.map((v) => v.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [vehicles]);
  const inv = () => queryClient.invalidateQueries({ queryKey: ['concession', companyId, 'overview'] });
  const patchV = useMutation({ mutationFn: (v: { id: number; body: Partial<ConcessionVehicle> }) => updateVehicle(companyId, v.id, v.body), onSuccess: inv, onError: () => toast('Échec.', 'error') });
  const del = useMutation({ mutationFn: (id: number) => deleteVehicle(companyId, id), onSuccess: () => { toast('Véhicule supprimé.', 'success'); inv(); }, onError: () => toast('Échec.', 'error') });
  const rows = vehicles.filter((v) => (!cat || v.category === cat) && v.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Catalogue véhicules</h3>
          <p className="text-xs text-muted-foreground">{vehicles.length} véhicule{vehicles.length > 1 ? 's' : ''} · prix d'achat (concession) et de vente (client).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-40`} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={`${inputCls} w-52 pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          {canWrite && <Button onClick={() => setModal({ edit: null })}><Plus className="h-4 w-4" /> Ajouter</Button>}
        </div>
      </div>
      <div className="mb-2 text-xs text-muted-foreground">{rows.length} affiché{rows.length > 1 ? 's' : ''}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left font-semibold" colSpan={2}>Véhicule</th>
              <th className="py-2 text-left font-semibold">Catégorie</th>
              <th className="py-2 text-right font-semibold">Prix achat</th>
              <th className="py-2 text-right font-semibold">Prix vente</th>
              <th className="py-2 text-center font-semibold">Vitrine</th>
              <th className="py-2 text-center font-semibold">Statut</th>
              {canWrite && <th className="py-2 text-center font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className={`border-b last:border-b-0 ${!v.available ? 'opacity-50' : ''}`}>
                <td className="w-12 py-2">
                  {v.imageUrl
                    ? <img src={v.imageUrl} alt="" className="h-9 w-14 rounded object-cover" />
                    : <div className="grid h-9 w-14 place-items-center rounded bg-muted text-muted-foreground"><CarFront className="h-4 w-4" /></div>}
                </td>
                <td className="py-2 font-medium"><div className="flex items-center gap-2">{v.name} <TypeBadge type={v.type} /></div></td>
                <td className="py-2 text-muted-foreground">{v.category}</td>
                <td className="py-2 text-right text-muted-foreground">{money(v.purchasePrice)}</td>
                <td className="py-2 text-right font-semibold text-emerald-400">{money(v.salePrice)}</td>
                <td className="py-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] ${v.showroom ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{v.showroom ? 'OUI' : 'NON'}</span></td>
                <td className="py-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] ${v.available ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{v.available ? 'DISPO' : 'RETIRÉ'}</span></td>
                {canWrite && (
                  <td className="py-2 text-center">
                    <div className="relative inline-block">
                      <button type="button" onClick={() => setMenu(menu === v.id ? null : v.id)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"><MoreVertical className="h-4 w-4" /></button>
                      {menu === v.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-popover p-1 text-sm shadow-lg">
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => { setMenu(null); setModal({ edit: v }); }}>Modifier</button>
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => { setMenu(null); patchV.mutate({ id: v.id, body: { available: !v.available } }); }}>{v.available ? 'Retirer de la vente' : 'Remettre en vente'}</button>
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => { setMenu(null); patchV.mutate({ id: v.id, body: { showroom: !v.showroom } }); }}>{v.showroom ? 'Cacher de la vitrine' : 'Afficher en vitrine'}</button>
                            <button type="button" className="block w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10" onClick={async () => { setMenu(null); if (await confirm({ title: 'Supprimer ce véhicule ?', message: v.name, destructive: true })) del.mutate(v.id); }}>Supprimer</button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={canWrite ? 8 : 7} className="py-6 text-center text-sm text-muted-foreground">Aucun véhicule.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && <VehicleModal companyId={companyId} edit={modal.edit} categories={categories} onClose={() => setModal(null)} onSaved={inv} />}
    </div>
  );
}

function VehicleModal({ companyId, edit, categories, onClose, onSaved }: { companyId: number; edit: ConcessionVehicle | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [category, setCategory] = useState(edit?.category ?? '');
  const [type, setType] = useState<VehicleType>(edit?.type ?? 'new');
  const [buy, setBuy] = useState(edit ? String(edit.purchasePrice) : '');
  const [sell, setSell] = useState(edit ? String(edit.salePrice) : '');
  const [imageUrl, setImageUrl] = useState(edit?.imageUrl ?? '');
  const [description, setDescription] = useState(edit?.description ?? '');
  const [showroom, setShowroom] = useState(edit?.showroom ?? true);
  const [available, setAvailable] = useState(edit?.available ?? true);
  const valid = name.trim().length > 0;
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        category: category.trim() || 'Autre',
        type,
        purchasePrice: Math.max(0, Math.round(Number(buy) || 0)),
        salePrice: Math.max(0, Math.round(Number(sell) || 0)),
        imageUrl: imageUrl.trim() || null,
        description: description.trim() || null,
        showroom,
        available,
      };
      return edit ? updateVehicle(companyId, edit.id, body) : addVehicle(companyId, body);
    },
    onSuccess: () => { toast(edit ? 'Véhicule modifié.' : 'Véhicule ajouté.', 'success'); onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  return (
    <ModalShell title={edit ? 'Modifier le véhicule' : 'Ajouter un véhicule'} onClose={onClose}>
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Nom / modèle</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Catégorie</span><input className={inputCls} list="concession-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Autre" /><datalist id="concession-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Type</span><select className={inputCls} value={type} onChange={(e) => setType(e.target.value as VehicleType)}><option value="new">Neuf</option><option value="used">Occasion</option></select></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix d'achat (concession)</span><input type="number" min="0" step="1" className={inputCls} value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="0" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix de vente (client)</span><input type="number" min="0" step="1" className={inputCls} value={sell} onChange={(e) => setSell(e.target.value)} placeholder="0" /></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Image (URL)</span><input className={inputCls} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Description (optionnel)</span><textarea className={`${inputCls} h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background/50 p-3 text-sm"><span className="font-medium">En vitrine</span><input type="checkbox" className="h-4 w-4 accent-primary" checked={showroom} onChange={(e) => setShowroom(e.target.checked)} /></label>
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background/50 p-3 text-sm"><span className="font-medium">Disponible</span><input type="checkbox" className="h-4 w-4 accent-primary" checked={available} onChange={(e) => setAvailable(e.target.checked)} /></label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function VentesTab({ companyId, vehicles, canWrite }: { companyId: number; vehicles: ConcessionVehicle[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(false);
  const list = useQuery({ queryKey: ['concession', companyId, 'sales'], queryFn: () => getConcessionSales(companyId) });
  const inv = () => { queryClient.invalidateQueries({ queryKey: ['concession', companyId, 'sales'] }); queryClient.invalidateQueries({ queryKey: ['concession', companyId, 'overview'] }); };
  const del = useMutation({ mutationFn: (id: number) => deleteSale(companyId, id), onSuccess: inv, onError: () => toast('Échec.', 'error') });
  const sales = list.data?.sales ?? [];

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Ventes enregistrées</h3>
          <p className="text-xs text-muted-foreground">Chaque vente alimente le CA de l'entreprise et la commission du vendeur.</p>
        </div>
        {canWrite && <Button onClick={() => setModal(true)}><Plus className="h-4 w-4" /> Nouvelle vente</Button>}
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : sales.length === 0 ? (
        <EmptyState icon={Receipt} title="Aucune vente" hint="Enregistre ta première vente de véhicule." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-semibold">Date</th>
                <th className="py-2 text-left font-semibold">Véhicule</th>
                <th className="py-2 text-left font-semibold">Client</th>
                <th className="py-2 text-left font-semibold">Plaque</th>
                <th className="py-2 text-right font-semibold">Prix vente</th>
                <th className="py-2 text-right font-semibold">Marge</th>
                <th className="py-2 text-right font-semibold">Commission</th>
                <th className="py-2 text-left font-semibold">Vendeur</th>
                {canWrite && <th className="py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {sales.map((t) => (
                <tr key={t.id} className="border-b last:border-b-0">
                  <td className="py-2 text-muted-foreground">{fmtDay(t.createdAt)}</td>
                  <td className="py-2 font-medium">{t.vehicleName}</td>
                  <td className="py-2 text-muted-foreground">{t.clientName || '—'}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">{t.plate || '—'}</td>
                  <td className="py-2 text-right font-semibold text-emerald-400">{money(t.salePrice)}</td>
                  <td className={`py-2 text-right ${t.margin >= 0 ? 'text-muted-foreground' : 'text-destructive'}`}>{money(t.margin)}</td>
                  <td className="py-2 text-right text-amber-400">{money(t.commission)}</td>
                  <td className="py-2 text-xs text-muted-foreground">{t.authorName ?? '—'}</td>
                  {canWrite && <td className="py-2 text-right"><button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer cette vente ?', message: `${t.vehicleName} · ${money(t.salePrice)}`, destructive: true })) del.mutate(t.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <SaleModal companyId={companyId} vehicles={vehicles} onClose={() => setModal(false)} onSaved={inv} />}
    </div>
  );
}

function SaleModal({ companyId, vehicles, onClose, onSaved }: { companyId: number; vehicles: ConcessionVehicle[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const available = vehicles.filter((v) => v.available);
  const [vehicleId, setVehicleId] = useState<number | ''>('');
  const [vehicleName, setVehicleName] = useState('');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [client, setClient] = useState('');
  const [plate, setPlate] = useState('');
  const [note, setNote] = useState('');

  const pick = (id: number | '') => {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) { setVehicleName(v.name); setBuy(String(v.purchasePrice)); setSell(String(v.salePrice)); }
  };

  const buyN = Math.max(0, Math.round(Number(buy) || 0));
  const sellN = Math.max(0, Math.round(Number(sell) || 0));
  const margin = sellN - buyN;
  const valid = vehicleName.trim().length > 0 && sellN >= 0;

  const save = useMutation({
    mutationFn: () => addSale(companyId, {
      vehicleId: vehicleId === '' ? null : (vehicleId as number),
      vehicleName: vehicleName.trim(),
      clientName: client.trim() || undefined,
      plate: plate.trim() || undefined,
      purchasePrice: buyN,
      salePrice: sellN,
      note: note.trim() || undefined,
    }),
    onSuccess: (r) => { toast(`Vente enregistrée. Commission : ${money(r.commission ?? 0)}`, 'success'); onSaved(); onClose(); },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });

  return (
    <ModalShell title="Nouvelle vente de véhicule" onClose={onClose}>
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Véhicule du catalogue (optionnel)</span>
          <select className={inputCls} value={vehicleId} onChange={(e) => pick(e.target.value ? Number(e.target.value) : '')} autoFocus>
            <option value="">— Saisie libre —</option>
            {available.map((v) => <option key={v.id} value={v.id}>{v.name} ({money(v.salePrice)})</option>)}
          </select>
        </label>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Nom du véhicule vendu</span><input className={inputCls} value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} placeholder="Modèle" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix d'achat</span><input type="number" min="0" step="1" className={inputCls} value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="0" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix de vente</span><input type="number" min="0" step="1" className={inputCls} value={sell} onChange={(e) => setSell(e.target.value)} placeholder="0" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Client (optionnel)</span><input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nom du client" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Plaque (optionnel)</span><input className={inputCls} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC 123" /></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Note (optionnel)</span><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Tag className="h-3.5 w-3.5" /> Marge concession</span>
          <span className={`text-xl font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>{money(margin)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">La commission du vendeur est calculée automatiquement selon son taux (grade ou taux du module) et ajoutée à sa paie.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer la vente'}</Button>
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
