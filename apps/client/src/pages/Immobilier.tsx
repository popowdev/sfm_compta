import { useEffect, useState } from 'react';
import { mondayOf } from '@/lib/bizWeek';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Pencil, Trash2, Eye, Key, KeyRound, Home, BadgeCheck, Receipt, CheckCircle2,
  CalendarPlus, Search, RotateCcw, ChevronLeft, ChevronRight, MapPin, SlidersHorizontal,
} from 'lucide-react';
import { IMMO_RENTAL_STATUSES, IMMO_SALE_STATUSES, type ImmoRentalStatus, type ImmoSaleStatus } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useCompany, useModulePerms } from '@/lib/useCompany';
import { fmtMoney } from '@/lib/declarations';
import {
  getRentals, createRental, updateRental, deleteRental,
  getRentInvoices, generateRentInvoice, setRentInvoiceStatus, getUnpaidInvoices,
  getSales, createSale, updateSale, deleteSale,
  type Rental, type Sale, type ListParams,
} from '@/lib/immo';
import { ImmoSettingsPanel } from '@/components/ImmoSettings';
import { PricingCalculator } from '@/components/ImmoPricing';
import type { PricingDetail } from '@/lib/immo';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';
const RENTAL_LABEL: Record<string, string> = Object.fromEntries(IMMO_RENTAL_STATUSES.map((s) => [s.key, s.label]));
const SALE_LABEL: Record<string, string> = Object.fromEntries(IMMO_SALE_STATUSES.map((s) => [s.key, s.label]));
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-orange-500/15 text-orange-300',
  terminee: 'bg-muted text-muted-foreground',
  resiliee: 'bg-destructive/15 text-destructive',
  disponible: 'bg-emerald-500/15 text-emerald-300',
  vendu: 'bg-sky-500/15 text-sky-300',
};
const PAGE_SIZE = 15;

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
}
function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Tab = 'locations' | 'ventes' | 'parametres';

export default function Immobilier() {
  const { companyId, canCreate, canEdit, canDelete } = useModulePerms('immobilier');
  const { slug } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initRef = searchParams.get('ref') ?? '';
  const initTab: Tab = searchParams.get('tab') === 'vente' ? 'ventes' : 'locations';
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>(initTab);
  const [page, setPage] = useState(1);
  const [fRef, setFRef] = useState(initRef);
  const [fName, setFName] = useState('');
  const [fAgent, setFAgent] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [applied, setApplied] = useState<ListParams>(initRef ? { q: initRef } : {});
  const [autoOpen, setAutoOpen] = useState(!!initRef);
  const openMap = (ref: string) => navigate(`/entreprise/${slug}/m/immo_carte?focus=${encodeURIComponent(ref)}`);

  const params: ListParams = { ...applied, page, limit: PAGE_SIZE };
  const rentalsQ = useQuery({ queryKey: ['immo-rentals', companyId, params], queryFn: () => getRentals(companyId, params), enabled: tab === 'locations' });
  const salesQ = useQuery({ queryKey: ['immo-sales', companyId, params], queryFn: () => getSales(companyId, params), enabled: tab === 'ventes' });
  const statsQ = useQuery({
    queryKey: ['immo-stats', companyId],
    queryFn: async () => {
      const [r, s] = await Promise.all([getRentals(companyId, { limit: 1 }), getSales(companyId, { limit: 1 })]);
      return { rental: r.stats, sale: s.stats };
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['immo-rentals', companyId] });
    queryClient.invalidateQueries({ queryKey: ['immo-sales', companyId] });
    queryClient.invalidateQueries({ queryKey: ['immo-stats', companyId] });
  };

  const [rentalModal, setRentalModal] = useState<{ open: boolean; edit: Rental | null }>({ open: false, edit: null });
  const [saleModal, setSaleModal] = useState<{ open: boolean; edit: Sale | null }>({ open: false, edit: null });
  const [invoicesFor, setInvoicesFor] = useState<Rental | null>(null);
  const [detail, setDetail] = useState<{ kind: Tab; data: Rental | Sale } | null>(null);
  const [unpaidOpen, setUnpaidOpen] = useState(false);

  const removeRental = useMutation({ mutationFn: (id: number) => deleteRental(companyId, id), onSuccess: invalidateAll, onError: () => toast('Échec.', 'error') });
  const removeSale = useMutation({ mutationFn: (id: number) => deleteSale(companyId, id), onSuccess: invalidateAll, onError: () => toast('Échec.', 'error') });

  const applyFilters = () => {
    setApplied({ q: fRef.trim() || undefined, tenant: fName.trim() || undefined, agent: fAgent.trim() || undefined, status: fStatus || undefined });
    setPage(1);
  };
  const resetFilters = () => {
    setFRef(''); setFName(''); setFAgent(''); setFStatus(''); setApplied({}); setPage(1);
  };
  const switchTab = (t: Tab) => { setTab(t); setPage(1); resetFilters(); };

  const rentals = rentalsQ.data?.rentals ?? [];
  const sales = salesQ.data?.sales ?? [];
  const total = tab === 'locations' ? rentalsQ.data?.total ?? 0 : salesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loading = tab === 'locations' ? rentalsQ.isLoading : salesQ.isLoading;
  const rentalStats = statsQ.data?.rental;
  const saleStats = statsQ.data?.sale;
  const statusOptions = tab === 'locations' ? IMMO_RENTAL_STATUSES : IMMO_SALE_STATUSES;

  // Ouverture auto de la fiche quand on arrive depuis la carte (?ref=…).
  useEffect(() => {
    if (!autoOpen) return;
    if (tab === 'locations' && rentalsQ.data) {
      const m = rentals.find((r) => r.propertyRef === initRef);
      if (m) setDetail({ kind: 'locations', data: m });
      setAutoOpen(false);
    } else if (tab === 'ventes' && salesQ.data) {
      const m = sales.find((s) => s.propertyRef === initRef);
      if (m) setDetail({ kind: 'ventes', data: m });
      setAutoOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalsQ.data, salesQ.data, autoOpen]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Immobilier</p>
          <h1 className="text-xl font-bold">Gestion Propriétés</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <>
              <Button className="bg-emerald-600 hover:bg-emerald-600/90" onClick={() => setSaleModal({ open: true, edit: null })}>
                <Plus className="h-4 w-4" /> Nouvelle vente
              </Button>
              <Button onClick={() => setRentalModal({ open: true, edit: null })}>
                <Plus className="h-4 w-4" /> Nouvelle location
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setUnpaidOpen(true)}>
            <Receipt className="h-4 w-4" /> Factures impayées
            {(rentalStats?.unpaidInvoices ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{rentalStats!.unpaidInvoices}</span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Key} label="Total locations" value={String(rentalStats?.total ?? 0)} />
        <Kpi icon={KeyRound} label="Locations actives" value={String(rentalStats?.active ?? 0)} accent="text-orange-400" />
        <Kpi icon={Home} label="Total ventes" value={String(saleStats?.total ?? 0)} />
        <Kpi icon={BadgeCheck} label="Ventes vendues" value={String(saleStats?.sold ?? 0)} accent="text-sky-400" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex gap-1 border-b p-1.5">
          <TabBtn active={tab === 'locations'} onClick={() => switchTab('locations')} icon={KeyRound} label="Locations" count={rentalStats?.total} />
          <TabBtn active={tab === 'ventes'} onClick={() => switchTab('ventes')} icon={Home} label="Ventes" count={saleStats?.total} />
          {canDelete && <TabBtn active={tab === 'parametres'} onClick={() => switchTab('parametres')} icon={SlidersHorizontal} label="Paramètres" />}
        </div>

        {tab === 'parametres' ? (
          <ImmoSettingsPanel companyId={companyId} canManage={canDelete} />
        ) : (<>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <span className={labelCls}>Numéro de propriété</span>
            <input className={inputCls} value={fRef} onChange={(e) => setFRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} placeholder="Rechercher un numéro…" />
          </label>
          <label className="text-sm">
            <span className={labelCls}>{tab === 'locations' ? 'Locataire' : 'Acheteur'}</span>
            <input className={inputCls} value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} placeholder="Rechercher un nom…" />
          </label>
          <label className="text-sm">
            <span className={labelCls}>Agent</span>
            <input className={inputCls} value={fAgent} onChange={(e) => setFAgent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} placeholder="Agent…" />
          </label>
          <label className="text-sm">
            <span className={labelCls}>Statut</span>
            <select className={inputCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Tous</option>
              {statusOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button onClick={applyFilters}><Search className="h-4 w-4" /> Filtrer</Button>
            <Button variant="outline" onClick={resetFilters}><RotateCcw className="h-4 w-4" /> Réinit.</Button>
          </div>
        </div>

        <div className="border-t">
          {loading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-12 rounded-lg" /><Skeleton className="h-12 rounded-lg" /><Skeleton className="h-12 rounded-lg" /></div>
          ) : (tab === 'locations' ? rentals.length === 0 : sales.length === 0) ? (
            <div className="p-4">
              <EmptyState icon={tab === 'locations' ? Key : Home} title={`Aucun${tab === 'locations' ? 'e location' : 'e vente'}`} hint="Ajoute un bien avec le bouton en haut à droite." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Propriété</th>
                    <th className="px-4 py-3 text-left font-semibold">{tab === 'locations' ? 'Locataire' : 'Acheteur'}</th>
                    <th className="px-4 py-3 text-right font-semibold">Montant</th>
                    <th className="px-4 py-3 text-left font-semibold">Statut</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tab === 'locations'
                    ? rentals.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/40">
                        <td className="px-4 py-3"><span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">Location</span></td>
                        <td className="px-4 py-3 font-medium text-primary">{r.propertyRef}</td>
                        <td className="px-4 py-3">{r.tenant ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmtMoney(r.weeklyRent)} $/sem{r.unpaidCount > 0 && <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{r.unpaidCount}</span>}</td>
                        <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? ''}`}>{RENTAL_LABEL[r.status]}</span></td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.startDate)}</td>
                        <td className="px-4 py-3">
                          <RowActions
                            onView={() => setDetail({ kind: 'locations', data: r })}
                            onInvoices={() => setInvoicesFor(r)}
                            onEdit={canEdit ? () => setRentalModal({ open: true, edit: r }) : undefined}
                            onDelete={canDelete ? async () => { if (await confirm({ title: 'Supprimer cette location ?', message: r.propertyRef, destructive: true })) removeRental.mutate(r.id); } : undefined}
                          />
                        </td>
                      </tr>
                    ))
                    : sales.map((s) => (
                      <tr key={s.id} className="border-b last:border-b-0 hover:bg-accent/40">
                        <td className="px-4 py-3"><span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-300">Vente</span></td>
                        <td className="px-4 py-3 font-medium text-primary">{s.propertyRef}</td>
                        <td className="px-4 py-3">{s.buyer ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmtMoney(s.price)} $</td>
                        <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status] ?? ''}`}>{SALE_LABEL[s.status]}</span></td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.saleDate)}</td>
                        <td className="px-4 py-3">
                          <RowActions
                            onView={() => setDetail({ kind: 'ventes', data: s })}
                            onEdit={canEdit ? () => setSaleModal({ open: true, edit: s }) : undefined}
                            onDelete={canDelete ? async () => { if (await confirm({ title: 'Supprimer ce bien ?', message: s.propertyRef, destructive: true })) removeSale.mutate(s.id); } : undefined}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{total} résultat{total > 1 ? 's' : ''} · page {page}/{totalPages}</span>
            <div className="flex gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-40 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-40 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        </>)}
      </div>

      {rentalModal.open && <RentalModal companyId={companyId} edit={rentalModal.edit} onClose={() => setRentalModal({ open: false, edit: null })} onSaved={invalidateAll} />}
      {saleModal.open && <SaleModal companyId={companyId} edit={saleModal.edit} onClose={() => setSaleModal({ open: false, edit: null })} onSaved={invalidateAll} />}
      {invoicesFor && <InvoicesModal companyId={companyId} rental={invoicesFor} canWrite={canEdit} onClose={() => setInvoicesFor(null)} onChange={invalidateAll} />}
      {detail && <DetailModal companyId={companyId} canEdit={canEdit} kind={detail.kind} data={detail.data} onClose={() => setDetail(null)} onChanged={invalidateAll} onOpenMap={detail.data.onMap ? () => openMap(detail.data.propertyRef) : undefined} />}
      {unpaidOpen && <UnpaidModal companyId={companyId} canWrite={canEdit} onClose={() => setUnpaidOpen(false)} onChange={invalidateAll} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Home; label: string; count?: number }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
      <Icon className="h-4 w-4" /> {label}
      {count !== undefined && <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{count}</span>}
    </button>
  );
}

function RowActions({ onView, onInvoices, onEdit, onDelete }: { onView: () => void; onInvoices?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <button type="button" onClick={onView} title="Voir" className="grid h-8 w-8 place-items-center rounded-md bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"><Eye className="h-4 w-4" /></button>
      {onInvoices && <button type="button" onClick={onInvoices} title="Loyers" className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground hover:bg-accent"><Receipt className="h-4 w-4" /></button>}
      {onEdit && <button type="button" onClick={onEdit} title="Modifier" className="grid h-8 w-8 place-items-center rounded-md bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"><Pencil className="h-4 w-4" /></button>}
      {onDelete && <button type="button" onClick={onDelete} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RentalModal({ companyId, edit, onClose, onSaved }: { companyId: number; edit: Rental | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    propertyRef: edit?.propertyRef ?? '', tenantName: edit?.tenant ?? '', agent: edit?.agent ?? '',
    weeklyRent: edit ? String(edit.weeklyRent) : '', startDate: edit?.startDate ?? '',
    status: (edit?.status ?? 'active') as ImmoRentalStatus, notes: edit?.notes ?? '',
    autoGenerate: edit?.autoGenerate ?? false, reminderEnabled: edit?.reminderEnabled ?? false,
    tenantDiscordId: edit?.tenantDiscordId ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const [pricing, setPricing] = useState<PricingDetail | null>(edit?.pricingDetail ?? null);
  const save = useMutation({
    mutationFn: () => {
      const body = { propertyRef: f.propertyRef.trim(), tenantName: f.tenantName.trim() || null, agent: f.agent.trim() || null, weeklyRent: pricing?.finalPrice ?? (Number(f.weeklyRent) || 0), startDate: f.startDate || null, status: f.status, autoGenerate: f.autoGenerate, reminderEnabled: f.reminderEnabled, tenantDiscordId: f.tenantDiscordId.trim() || null, notes: f.notes.trim() || null, pricingDetail: pricing };
      return edit ? updateRental(companyId, edit.id, body) : createRental(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const valid = f.propertyRef.trim().length > 0 && (!f.reminderEnabled || /^\d{5,25}$/.test(f.tenantDiscordId.trim()));
  return (
    <ModalShell title={edit ? 'Modifier la location' : 'Nouvelle location'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="col-span-2 text-sm"><span className={labelCls}>N° / Réf. du bien</span><input className={inputCls} value={f.propertyRef} onChange={(e) => set('propertyRef', e.target.value)} placeholder="ex. 7031A" autoFocus /></label>
        <PricingCalculator companyId={companyId} kind="location" initial={edit?.pricingDetail ?? null} onChange={setPricing} />
        <label className="text-sm"><span className={labelCls}>Locataire</span><input className={inputCls} value={f.tenantName} onChange={(e) => set('tenantName', e.target.value)} placeholder="ex. John Doe" /></label>
        <label className="text-sm"><span className={labelCls}>Agent</span><input className={inputCls} value={f.agent} onChange={(e) => set('agent', e.target.value)} placeholder="Agent" /></label>
        <label className="text-sm"><span className={labelCls}>Début</span><input type="date" className={inputCls} value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
        <label className="col-span-2 text-sm"><span className={labelCls}>Statut</span><select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value as ImmoRentalStatus)}>{IMMO_RENTAL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>

        <div className="col-span-2 space-y-2 rounded-lg border bg-background/50 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span><span className="font-medium">Génération auto des loyers</span><span className="block text-xs text-muted-foreground">Crée le loyer chaque semaine automatiquement.</span></span>
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.autoGenerate} onChange={(e) => set('autoGenerate', e.target.checked)} />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 border-t pt-2 text-sm">
            <span><span className="font-medium">Rappel de paiement Discord</span><span className="block text-xs text-muted-foreground">MP RP au locataire à chaque nouveau loyer.</span></span>
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.reminderEnabled} onChange={(e) => set('reminderEnabled', e.target.checked)} />
          </label>
          {f.reminderEnabled && (
            <label className="block text-sm">
              <span className={labelCls}>ID Discord du locataire</span>
              <input className={inputCls} value={f.tenantDiscordId} onChange={(e) => set('tenantDiscordId', e.target.value.replace(/\D/g, ''))} placeholder="ex. 123456789012345678" inputMode="numeric" />
              {!/^\d{5,25}$/.test(f.tenantDiscordId.trim()) && <span className="mt-1 block text-xs text-destructive">ID Discord requis (chiffres uniquement).</span>}
            </label>
          )}
        </div>

        <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Créer'}</Button></div>
      </form>
    </ModalShell>
  );
}

function SaleModal({ companyId, edit, onClose, onSaved }: { companyId: number; edit: Sale | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    propertyRef: edit?.propertyRef ?? '', buyerName: edit?.buyer ?? '', agent: edit?.agent ?? '',
    price: edit ? String(edit.price) : '', saleDate: edit?.saleDate ?? '',
    status: (edit?.status ?? 'disponible') as ImmoSaleStatus, notes: edit?.notes ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [pricing, setPricing] = useState<PricingDetail | null>(edit?.pricingDetail ?? null);
  const save = useMutation({
    mutationFn: () => {
      const body = { propertyRef: f.propertyRef.trim(), buyerName: f.buyerName.trim() || null, agent: f.agent.trim() || null, price: pricing?.finalPrice ?? (Number(f.price) || 0), saleDate: f.saleDate || null, status: f.status, notes: f.notes.trim() || null, pricingDetail: pricing };
      return edit ? updateSale(companyId, edit.id, body) : createSale(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const valid = f.propertyRef.trim().length > 0;
  return (
    <ModalShell title={edit ? 'Modifier la vente' : 'Nouvelle vente'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="col-span-2 text-sm"><span className={labelCls}>N° / Réf. du bien</span><input className={inputCls} value={f.propertyRef} onChange={(e) => set('propertyRef', e.target.value)} placeholder="ex. 8207" autoFocus /></label>
        <PricingCalculator companyId={companyId} kind="vente" initial={edit?.pricingDetail ?? null} onChange={setPricing} />
        <label className="text-sm"><span className={labelCls}>Statut</span><select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>{IMMO_SALE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <label className="text-sm"><span className={labelCls}>Acheteur</span><input className={inputCls} value={f.buyerName} onChange={(e) => set('buyerName', e.target.value)} placeholder="ex. John Doe" /></label>
        <label className="text-sm"><span className={labelCls}>Agent</span><input className={inputCls} value={f.agent} onChange={(e) => set('agent', e.target.value)} placeholder="Agent" /></label>
        <label className="text-sm"><span className={labelCls}>Date de vente</span><input type="date" className={inputCls} value={f.saleDate} onChange={(e) => set('saleDate', e.target.value)} /></label>
        <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Créer'}</Button></div>
      </form>
    </ModalShell>
  );
}

function DetailModal({ companyId, canEdit, kind, data, onClose, onChanged, onOpenMap }: { companyId: number; canEdit: boolean; kind: Tab; data: Rental | Sale; onClose: () => void; onChanged: () => void; onOpenMap?: () => void }) {
  const toast = useToast();
  const rental = kind === 'locations' ? (data as Rental) : null;
  const [autoGen, setAutoGen] = useState(rental?.autoGenerate ?? false);
  const [reminder, setReminder] = useState(rental?.reminderEnabled ?? false);
  const hasDiscord = !!rental?.tenantDiscordId;
  const toggle = useMutation({
    mutationFn: (body: { autoGenerate?: boolean; reminderEnabled?: boolean }) => updateRental(companyId, rental!.id, body),
    onSuccess: onChanged,
    onError: () => toast('Échec.', 'error'),
  });
  const rows: [string, string][] = kind === 'locations'
    ? (() => { const r = data as Rental; return [['Propriété', r.propertyRef], ['Locataire', r.tenant ?? '—'], ['Agent', r.agent ?? '—'], ['Loyer', `${fmtMoney(r.weeklyRent)} $/sem.`], ['Statut', RENTAL_LABEL[r.status] ?? r.status], ['Début', fmtDate(r.startDate)], ['Loyers impayés', String(r.unpaidCount)], ['Notes', r.notes ?? '—']]; })()
    : (() => { const s = data as Sale; return [['Propriété', s.propertyRef], ['Acheteur', s.buyer ?? '—'], ['Agent', s.agent ?? '—'], ['Prix', `${fmtMoney(s.price)} $`], ['Statut', SALE_LABEL[s.status] ?? s.status], ['Date', fmtDate(s.saleDate)], ['Notes', s.notes ?? '—']]; })();
  return (
    <ModalShell title={`Détails — ${data.propertyRef}`} onClose={onClose}>
      <dl className="divide-y px-5 pt-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
        ))}
      </dl>
      {rental && (
        <div className="mx-5 my-3 space-y-2 rounded-lg border bg-background/50 p-3">
          <ToggleRow
            label="Génération auto des loyers"
            hint="Crée le loyer chaque semaine automatiquement."
            on={autoGen}
            disabled={!canEdit || toggle.isPending}
            onToggle={() => { const v = !autoGen; setAutoGen(v); toggle.mutate({ autoGenerate: v }); }}
          />
          <div className="border-t pt-2">
            <ToggleRow
              label="Rappel de paiement Discord"
              hint={hasDiscord ? 'MP RP au locataire à chaque nouveau loyer.' : 'Renseigne l’ID Discord via « Modifier ».'}
              on={reminder}
              disabled={!canEdit || !hasDiscord || toggle.isPending}
              onToggle={() => { const v = !reminder; setReminder(v); toggle.mutate({ reminderEnabled: v }); }}
            />
          </div>
        </div>
      )}
      {onOpenMap && (
        <div className="border-t px-5 py-4">
          <Button variant="outline" className="w-full" onClick={onOpenMap}><MapPin className="h-4 w-4" /> Voir sur la carte</Button>
        </div>
      )}
    </ModalShell>
  );
}

function ToggleRow({ label, hint, on, disabled, onToggle }: { label: string; hint: string; on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{hint}</div></div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-muted'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function InvoicesModal({ companyId, rental, canWrite, onClose, onChange }: { companyId: number; rental: Rental; canWrite: boolean; onClose: () => void; onChange: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['immo-invoices', rental.id], queryFn: () => getRentInvoices(companyId, rental.id) });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['immo-invoices', rental.id] }); onChange(); };
  const gen = useMutation({ mutationFn: () => generateRentInvoice(companyId, rental.id, mondayOf(new Date())), onSuccess: invalidate, onError: () => toast('Un loyer existe déjà pour cette semaine.', 'error') });
  const setStatus = useMutation({ mutationFn: (v: { id: number; status: 'paye' | 'impaye' }) => setRentInvoiceStatus(companyId, v.id, v.status), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });
  const invoices = q.data?.invoices ?? [];
  const s = q.data?.summary;
  const lastPaid = s?.lastPayment;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><h2 className="text-sm font-semibold">Loyers — {rental.propertyRef}</h2><p className="text-xs text-muted-foreground">{rental.tenant ?? '—'} · {fmtMoney(rental.weeklyRent)} $/sem.</p></div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b px-5 py-3">
          <div className="rounded-lg bg-emerald-500/10 px-3 py-2"><div className="text-[11px] text-emerald-300/80">Encaissé</div><div className="text-sm font-semibold text-emerald-300">{fmtMoney(s?.totalPaid ?? 0)} $</div><div className="text-[10px] text-muted-foreground">{s?.paidCount ?? 0} sem. payée{(s?.paidCount ?? 0) > 1 ? 's' : ''}</div></div>
          <div className={`rounded-lg px-3 py-2 ${(s?.unpaidCount ?? 0) > 0 ? 'bg-destructive/10' : 'bg-muted/50'}`}><div className={`text-[11px] ${(s?.unpaidCount ?? 0) > 0 ? 'text-destructive/80' : 'text-muted-foreground'}`}>Impayé</div><div className={`text-sm font-semibold ${(s?.unpaidCount ?? 0) > 0 ? 'text-destructive' : ''}`}>{fmtMoney(s?.totalUnpaid ?? 0)} $</div><div className="text-[10px] text-muted-foreground">{s?.unpaidCount ?? 0} sem.</div></div>
          <div className="rounded-lg bg-muted/50 px-3 py-2"><div className="text-[11px] text-muted-foreground">Dernier paiement</div><div className="text-sm font-semibold">{lastPaid ? fmtDateTime(lastPaid.paidAt) : '—'}</div><div className="text-[10px] text-muted-foreground">{lastPaid ? `sem. ${fmtDate(lastPaid.weekStart)}` : 'aucun'}</div></div>
        </div>

        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-xs font-medium text-muted-foreground">Historique des loyers</span>
          {canWrite && <Button variant="outline" onClick={() => gen.mutate()} disabled={gen.isPending}><CalendarPlus className="h-4 w-4" /> Générer la semaine</Button>}
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-5">
          {invoices.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun loyer généré.</div> : invoices.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
              <div>
                <div className="text-sm font-medium">Semaine du {fmtDate(i.weekStart)}</div>
                <div className="text-xs text-muted-foreground">{fmtMoney(i.amount)} ${i.status === 'paye' && i.paidAt ? ` · payé le ${fmtDateTime(i.paidAt)}` : ''}</div>
              </div>
              {i.status === 'paye'
                ? <button type="button" disabled={!canWrite || setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: 'impaye' })} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 disabled:opacity-60"><CheckCircle2 className="h-3.5 w-3.5" /> Payé</button>
                : <button type="button" disabled={!canWrite || setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: 'paye' })} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive disabled:opacity-60">Impayé — marquer payé</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UnpaidModal({ companyId, canWrite, onClose, onChange }: { companyId: number; canWrite: boolean; onClose: () => void; onChange: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['immo-unpaid', companyId], queryFn: () => getUnpaidInvoices(companyId) });
  const pay = useMutation({
    mutationFn: (id: number) => setRentInvoiceStatus(companyId, id, 'paye'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['immo-unpaid', companyId] }); onChange(); },
    onError: () => toast('Échec.', 'error'),
  });
  const invoices = q.data?.invoices ?? [];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Factures impayées · {invoices.length}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-5">
          {q.isLoading ? <Skeleton className="h-16 rounded-lg" /> : invoices.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun loyer impayé 🎉</div> : invoices.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
              <div><div className="text-sm font-medium">{i.propertyRef} · {i.tenant ?? '—'}</div><div className="text-xs text-muted-foreground">Semaine du {fmtDate(i.weekStart)} · {fmtMoney(i.amount)} $</div></div>
              {canWrite && <button type="button" disabled={pay.isPending} onClick={() => pay.mutate(i.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 disabled:opacity-60"><CheckCircle2 className="h-3.5 w-3.5" /> Marquer payé</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
