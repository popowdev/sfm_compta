import { useMemo, useRef, useState } from 'react';
import { useCompany, useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CarFront, Plus, Trash2, Boxes, Receipt, TrendingUp, Coins, X, MoreVertical, Search, ExternalLink, Copy, RefreshCw, Tag, Upload, ShoppingCart } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getConcessionOverview, getConcessionSales,
  addVehicle, updateVehicle, deleteVehicle, uploadVehicleImage,
  addSale, deleteSale, regenerateShowroomToken,
  type ConcessionVehicle, type ConcessionSale, type ConcessionShowroom, type VehicleType, type PastClient,
  getConcessionPurchases,
  addPurchase,
  deletePurchase,
} from '@/lib/concession';
import { getClients } from '@/lib/clients';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function Autocomplete<T>({ value, onChange, onPick, placeholder, options, getLabel, getKey, renderRight, autoFocus, emptyHint }: {
  value: string; onChange: (v: string) => void; onPick: (o: T) => void;
  placeholder?: string; options: T[]; getLabel: (o: T) => string; getKey: (o: T) => string | number;
  renderRight?: (o: T) => React.ReactNode; autoFocus?: boolean; emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q ? options.filter((o) => getLabel(o).toLowerCase().includes(q)).slice(0, 8) : [];
  return (
    <div className="relative">
      <input className={inputCls} value={value} autoFocus={autoFocus} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} />
      {open && q.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
          {matches.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">{emptyHint ?? 'Aucun résultat — saisie libre conservée.'}</div>
          ) : matches.map((o) => (
            <button type="button" key={getKey(o)} onMouseDown={(e) => { e.preventDefault(); onPick(o); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
              <span className="truncate">{getLabel(o)}</span>
              {renderRight && <span className="shrink-0 text-xs text-muted-foreground">{renderRight(o)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const money = (n: number) => `${fmtInt(n)} $`;
const fmtDay = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

type Tab = 'catalogue' | 'ventes' | 'achats';

export default function Concession() {
  const { companyId, isLoading } = useCompany();
  const canManage = useModulePerms('concession').canDelete;
  const [tab, setTab] = useState<Tab>('catalogue');
  const q = useQuery({ queryKey: ['concession', companyId, 'overview'], queryFn: () => getConcessionOverview(companyId), enabled: !!companyId });

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={CarFront} title="Concession auto" hint="Module indisponible." />;

  const { vehicles, summary, canWrite, showroom, pastClients } = q.data;
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

      {canWrite && <ShowroomBanner companyId={companyId} showroom={showroom} canManage={canManage} />}

      <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1">
        <TabBtn k="catalogue" label="Catalogue" icon={Boxes} />
        <TabBtn k="ventes" label="Ventes" icon={Receipt} />
        <TabBtn k="achats" label="Achats" icon={ShoppingCart} />
      </div>

      {tab === 'catalogue' && <CatalogueTab companyId={companyId} vehicles={vehicles} canManage={canManage} />}
      {tab === 'ventes' && <VentesTab companyId={companyId} vehicles={vehicles} canWrite={canWrite} pastClients={pastClients} />}
      {tab === 'achats' && <AchatsTab companyId={companyId} canManage={canManage} />}
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

function ShowroomBanner({ companyId, showroom, canManage }: { companyId: number; showroom: ConcessionShowroom; canManage: boolean }) {
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
          {canManage && <Button size="sm" variant="outline" disabled={regen.isPending}
            onClick={async () => { if (await confirm({ title: 'Régénérer le lien ?', message: 'L\'ancien lien cessera de fonctionner immédiatement.', destructive: true })) regen.mutate(); }}>
            <RefreshCw className="h-4 w-4" /> Régénérer
          </Button>}
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

function CatalogueTab({ companyId, vehicles, canManage }: { companyId: number; vehicles: ConcessionVehicle[]; canManage: boolean }) {
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
          {canManage && <Button onClick={() => setModal({ edit: null })}><Plus className="h-4 w-4" /> Ajouter</Button>}
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
              {canManage && <th className="py-2 text-center font-semibold">Actions</th>}
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
                {canManage && (
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
            {rows.length === 0 && <tr><td colSpan={canManage ? 8 : 7} className="py-6 text-center text-sm text-muted-foreground">Aucun véhicule.</td></tr>}
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = name.trim().length > 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadVehicleImage(companyId, file);
      setImageUrl(url);
      toast('Image importée.', 'success');
    } catch {
      toast("Échec de l'import (image trop lourde ou format non supporté).", 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
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
        <div className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Image du véhicule</span>
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
              {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <CarFront className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {uploading ? 'Import…' : 'Choisir un fichier'}
                </Button>
                {imageUrl && <Button type="button" size="sm" variant="outline" onClick={() => setImageUrl('')}>Retirer</Button>}
              </div>
              <input className={`${inputCls} h-8 text-xs`} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="…ou colle une URL" />
            </div>
          </div>
        </div>
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

function VentesTab({ companyId, vehicles, canWrite, pastClients }: { companyId: number; vehicles: ConcessionVehicle[]; canWrite: boolean; pastClients: PastClient[] }) {
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
      {modal && <SaleModal companyId={companyId} vehicles={vehicles} pastClients={pastClients} onClose={() => setModal(false)} onSaved={inv} />}
    </div>
  );
}

interface ClientOption { id: number | null; name: string; hint: string }

function SaleModal({ companyId, vehicles, pastClients, onClose, onSaved }: { companyId: number; vehicles: ConcessionVehicle[]; pastClients: PastClient[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const available = useMemo(() => vehicles.filter((v) => v.available), [vehicles]);
  const clientsQuery = useQuery({ queryKey: ['clients', companyId], queryFn: () => getClients(companyId), enabled: !!companyId, retry: false });
  const clientOptions = useMemo<ClientOption[]>(() => {
    const seen = new Set<string>();
    const out: ClientOption[] = [];
    for (const c of clientsQuery.data?.clients ?? []) {
      const k = c.name.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ id: c.id, name: c.name, hint: c.phone || 'fiche client' });
    }
    for (const p of pastClients) {
      const k = p.name.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ id: p.clientId, name: p.name, hint: 'client précédent' });
    }
    return out;
  }, [clientsQuery.data, pastClients]);

  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [vehicleName, setVehicleName] = useState('');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');
  const [plate, setPlate] = useState('');
  const [note, setNote] = useState('');

  const buyN = Math.max(0, Math.round(Number(buy) || 0));
  const sellN = Math.max(0, Math.round(Number(sell) || 0));
  const margin = sellN - buyN;
  const valid = vehicleName.trim().length > 0 && sellN >= 0;

  const save = useMutation({
    mutationFn: () => addSale(companyId, {
      vehicleId,
      clientId,
      vehicleName: vehicleName.trim(),
      clientName: clientName.trim() || undefined,
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
          <span className="mb-1 block text-xs text-muted-foreground">Véhicule {vehicleId ? '· lié au catalogue' : ''}</span>
          <Autocomplete<ConcessionVehicle>
            value={vehicleName} placeholder="Tape pour rechercher un modèle…" autoFocus
            options={available} getLabel={(v) => v.name} getKey={(v) => v.id} renderRight={(v) => money(v.salePrice)}
            onChange={(v) => { setVehicleName(v); setVehicleId(null); }}
            onPick={(v) => { setVehicleId(v.id); setVehicleName(v.name); setBuy(String(v.purchasePrice)); setSell(String(v.salePrice)); }}
            emptyHint="Aucun modèle — le nom saisi sera utilisé tel quel." />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix d'achat</span><input type="number" min="0" step="1" className={inputCls} value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="0" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-muted-foreground">Prix de vente</span><input type="number" min="0" step="1" className={inputCls} value={sell} onChange={(e) => setSell(e.target.value)} placeholder="0" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Client {clientId ? '· fiche liée' : '(optionnel)'}</span>
            <Autocomplete<ClientOption>
              value={clientName} placeholder="Rechercher / taper un client…"
              options={clientOptions} getLabel={(c) => c.name} getKey={(c) => c.id ?? `p:${c.name}`} renderRight={(c) => c.hint}
              onChange={(v) => { setClientName(v); setClientId(null); }}
              onPick={(c) => { setClientId(c.id); setClientName(c.name); }}
              emptyHint="Nouveau client — le nom saisi sera enregistré." />
          </label>
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

function AchatsTab({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['concession', companyId, 'purchases'], queryFn: () => getConcessionPurchases(companyId) });
  const inv = () => {
    queryClient.invalidateQueries({ queryKey: ['concession', companyId, 'purchases'] });
    queryClient.invalidateQueries({ queryKey: ['concession', companyId, 'overview'] });
  };
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [supplier, setSupplier] = useState('');

  const add = useMutation({
    mutationFn: () =>
      addPurchase(companyId, {
        vehicleName: name.trim(),
        quantity: Math.max(1, Math.floor(Number(qty) || 1)),
        unitPrice: Math.max(0, Math.floor(Number(price) || 0)),
        supplier: supplier.trim() || undefined,
      }),
    onSuccess: () => {
      toast('Achat enregistré.', 'success');
      setName(''); setQty('1'); setPrice(''); setSupplier('');
      inv();
    },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });
  const del = useMutation({ mutationFn: (id: number) => deletePurchase(companyId, id), onSuccess: inv, onError: () => toast('Échec.', 'error') });

  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!q.data) return <EmptyState icon={ShoppingCart} title="Achats" hint="Indisponible." />;
  const { purchases, weekTotal, weekCount } = q.data;
  const total = Math.max(0, Math.floor(Number(price) || 0)) * Math.max(1, Math.floor(Number(qty) || 1));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
        <span className="font-medium text-amber-300">Ce que tu paies pour approvisionner ton parc.</span>{' '}
        <span className="text-muted-foreground">
          Ces achats sont la seule chose déduite en charge dans ta comptabilité — le prix d’achat affiché sur une fiche
          véhicule ne sert qu’à calculer la marge et la commission du vendeur.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi icon={ShoppingCart} label="Achats de la semaine" value={money(weekTotal)} sub={`${weekCount} achat${weekCount > 1 ? 's' : ''}`} accent="text-destructive" />
        <Kpi icon={Boxes} label="Achats enregistrés" value={`${purchases.length}`} sub="historique" accent="text-sky-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canManage && (
          <form
            className="space-y-4 rounded-2xl border bg-card p-6 lg:col-span-1"
            onSubmit={(e) => { e.preventDefault(); if (!add.isPending && name.trim() && total > 0) add.mutate(); }}
          >
            <h3 className="text-sm font-semibold">Enregistrer un achat</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Véhicule</span>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Bravado Banshee" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Quantité</span>
                <input type="number" min="1" step="1" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Prix unitaire ($)</span>
                <input type="number" min="0" step="1" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Fournisseur (optionnel)</span>
              <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex. Import Los Santos" />
            </label>
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs text-muted-foreground">Total payé</span>
                <span className="text-lg font-bold text-destructive">{money(total)}</span>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={add.isPending || !name.trim() || total <= 0}>
              <Plus className="h-4 w-4" /> {add.isPending ? 'Enregistrement…' : "Enregistrer l'achat"}
            </Button>
          </form>
        )}

        <div className={`rounded-2xl border bg-card p-6 ${canManage ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h3 className="mb-3 text-sm font-semibold">Historique des achats</h3>
          {purchases.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Aucun achat enregistré" hint={canManage ? 'Enregistre ton premier approvisionnement.' : 'Rien pour le moment.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Date</th>
                    <th className="py-2 text-left font-semibold">Véhicule</th>
                    <th className="py-2 text-right font-semibold">Qté</th>
                    <th className="py-2 text-right font-semibold">Prix unit.</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                    <th className="py-2 text-left font-semibold">Fournisseur</th>
                    {canManage && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-b align-top last:border-b-0">
                      <td className="py-2 whitespace-nowrap text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td className="py-2 font-medium">{p.vehicleName}</td>
                      <td className="py-2 text-right">{p.quantity}</td>
                      <td className="py-2 text-right text-muted-foreground">{money(p.unitPrice)}</td>
                      <td className="py-2 text-right font-semibold text-destructive">{money(p.total)}</td>
                      <td className="py-2 text-muted-foreground">{p.supplier ?? '—'}</td>
                      {canManage && (
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={async () => { if (await confirm({ title: 'Supprimer cet achat ?', message: `${p.vehicleName} · ${money(p.total)}`, destructive: true })) del.mutate(p.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
