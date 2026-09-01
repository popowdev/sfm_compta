import { useState } from 'react';
import { weekRange } from '@/lib/bizWeek';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Car, Route, DollarSign, Users, Crown, Settings, Search, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kpi } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useModulePerms } from '@/lib/useCompany';
import { fmtMoney } from '@/lib/declarations';
import {
  getTaxiConfig, updateTaxiSettings, createVipType, updateVipType, deleteVipType,
  getCitoyens, createCitoyen, updateCitoyen, deleteCitoyen,
  getConcitoyens, createConcitoyen, updateConcitoyen, deleteConcitoyen,
  getVip, createVip, updateVip, deleteVip,
  type ListParams, type Driver, type VipType, type Citoyen, type Concitoyen, type Vip,
} from '@/lib/taxi';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';
const PAGE = 15;

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type Tab = 'citoyens' | 'concitoyens' | 'vip' | 'settings';

export default function Taxi() {
  const { companyId, canEdit, canDelete } = useModulePerms('taxi');
  const cfg = useQuery({ queryKey: ['taxi-config', companyId], queryFn: () => getTaxiConfig(companyId) });
  const [tab, setTab] = useState<Tab>('citoyens');
  const drivers = cfg.data?.drivers ?? [];
  const vipTypes = cfg.data?.vipTypes ?? [];
  const settings = cfg.data?.settings;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxi</p>
        <h1 className="text-xl font-bold">Gestion des courses</h1>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5">
        <TabBtn active={tab === 'citoyens'} onClick={() => setTab('citoyens')} icon={Car} label="Courses Citoyens" />
        <TabBtn active={tab === 'concitoyens'} onClick={() => setTab('concitoyens')} icon={Users} label="Courses Concitoyens" />
        <TabBtn active={tab === 'vip'} onClick={() => setTab('vip')} icon={Crown} label="Courses VIP" />
        {canDelete && <TabBtn active={tab === 'settings'} onClick={() => setTab('settings')} icon={Settings} label="Paramètres" />}
      </div>

      {tab === 'citoyens' && <CitoyensTab companyId={companyId} canEdit={canEdit} drivers={drivers} pricePerKm={settings?.pricePerKm ?? 20} />}
      {tab === 'concitoyens' && <ConcitoyensTab companyId={companyId} canEdit={canEdit} drivers={drivers} pricePerClient={settings?.pricePerClient ?? 605} />}
      {tab === 'vip' && <VipTab companyId={companyId} canEdit={canEdit} drivers={drivers} vipTypes={vipTypes} />}
      {tab === 'settings' && canDelete && <SettingsTab companyId={companyId} canManage={canDelete} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Car; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function FilterBar({ drivers, params, setParams }: { drivers: Driver[]; params: ListParams; setParams: (p: ListParams) => void }) {
  const [driverId, setDriverId] = useState<string>('');
  const [week, setWeek] = useState<'current' | 'all'>('current');
  const [date, setDate] = useState('');
  const [sort, setSort] = useState<'recent' | 'oldest' | 'amount'>('recent');
  const apply = () => {
    let from: string | undefined; let to: string | undefined;
    if (date) { from = date; to = date; }
    else if (week === 'current') { const w = weekRange(); from = w.from; to = w.to; }
    setParams({ driverId: driverId ? Number(driverId) : undefined, from, to, sort, page: 1 });
  };
  const reset = () => { setDriverId(''); setWeek('current'); setDate(''); setSort('recent'); const w = weekRange(); setParams({ from: w.from, to: w.to, sort: 'recent', page: 1 }); };
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-sm"><span className={labelCls}>Chauffeur</span>
        <select className={inputCls} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">Tous</option>
          {drivers.map((d) => <option key={d.userId} value={d.userId}>{d.name}</option>)}
        </select>
      </label>
      <label className="text-sm"><span className={labelCls}>Semaine</span>
        <select className={inputCls} value={week} onChange={(e) => setWeek(e.target.value as 'current' | 'all')} disabled={!!date}>
          <option value="current">Semaine actuelle</option>
          <option value="all">Toutes</option>
        </select>
      </label>
      <label className="text-sm"><span className={labelCls}>Date précise</span><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="text-sm"><span className={labelCls}>Tri</span>
        <select className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as 'recent')}>
          <option value="recent">Plus récentes</option>
          <option value="oldest">Plus anciennes</option>
          <option value="amount">Montant décroissant</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <Button onClick={apply}><Search className="h-4 w-4" /> Filtrer</Button>
        <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" /> Réinit.</Button>
      </div>
      {params.from && <div className="col-span-full text-xs text-muted-foreground">Période : {params.from} → {params.to}</div>}
    </div>
  );
}

function Pager({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  if (total <= PAGE) return null;
  const pages = Math.ceil(total / PAGE);
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">{total} course{total > 1 ? 's' : ''} · page {page}/{pages}</span>
      <div className="flex gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-40 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-40 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && <button type="button" onClick={onEdit} title="Modifier" className="grid h-8 w-8 place-items-center rounded-md bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"><Pencil className="h-4 w-4" /></button>}
      {onDelete && <button type="button" onClick={onDelete} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

function DriverSelect({ drivers, value, onChange }: { drivers: Driver[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="col-span-2 text-sm"><span className={labelCls}>Chauffeur *</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Moi</option>
        {drivers.map((d) => <option key={d.userId} value={d.userId}>{d.name}{d.gradeName ? ` (${d.gradeName})` : ''}</option>)}
      </select>
    </label>
  );
}

function CitoyensTab({ companyId, canEdit, drivers, pricePerKm }: { companyId: number; canEdit: boolean; drivers: Driver[]; pricePerKm: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const w = weekRange();
  const [params, setParams] = useState<ListParams>({ from: w.from, to: w.to, sort: 'recent', page: 1 });
  const q = useQuery({ queryKey: ['taxi-citoyens', companyId, params], queryFn: () => getCitoyens(companyId, { ...params, limit: PAGE }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['taxi-citoyens', companyId] });
  const [modal, setModal] = useState<{ open: boolean; edit: Citoyen | null }>({ open: false, edit: null });
  const remove = useMutation({ mutationFn: (id: number) => deleteCitoyen(companyId, id), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });
  const rows = q.data?.rows ?? []; const s = q.data?.stats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi icon={Car} label="Total des courses" value={String(s?.count ?? 0)} />
        <Kpi icon={Route} label="Total kilomètres" value={`${fmtMoney(s?.km ?? 0)} km`} accent="text-emerald-400" />
        <Kpi icon={DollarSign} label="Total revenus" value={`${fmtMoney(s?.revenue ?? 0)} $`} accent="text-sky-400" />
      </div>
      <FilterBar drivers={drivers} params={params} setParams={setParams} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Liste des courses</h2>
        {canEdit && <Button onClick={() => setModal({ open: true, edit: null })}><Plus className="h-4 w-4" /> Ajouter une course</Button>}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12 rounded-lg" /><Skeleton className="h-12 rounded-lg" /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyState icon={Car} title="Aucune course" hint="Ajoute une course citoyen." /></div>
          : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 text-left font-semibold">Date</th><th className="px-4 py-3 text-left font-semibold">Chauffeur</th><th className="px-4 py-3 text-right font-semibold">Km</th><th className="px-4 py-3 text-right font-semibold">Prix/km</th><th className="px-4 py-3 text-right font-semibold">Total</th><th className="px-4 py-3 text-right font-semibold"></th>
            </tr></thead><tbody>
              {rows.map((r) => <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/40">
                <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">{r.driverName || '—'}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(r.km)} km</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmtMoney(r.pricePerKm)} $</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmtMoney(r.total)} $</td>
                <td className="px-4 py-3"><RowActions onEdit={canEdit ? () => setModal({ open: true, edit: r }) : undefined} onDelete={canEdit ? async () => { if (await confirm({ title: 'Supprimer cette course ?', destructive: true })) remove.mutate(r.id); } : undefined} /></td>
              </tr>)}
            </tbody></table></div>}
        <Pager total={q.data?.total ?? 0} page={params.page ?? 1} onPage={(p) => setParams({ ...params, page: p })} />
      </div>
      {modal.open && <CitoyenModal companyId={companyId} edit={modal.edit} drivers={drivers} pricePerKm={pricePerKm} onClose={() => setModal({ open: false, edit: null })} onSaved={invalidate} />}
    </div>
  );
}

function CitoyenModal({ companyId, edit, drivers, pricePerKm, onClose, onSaved }: { companyId: number; edit: Citoyen | null; drivers: Driver[]; pricePerKm: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [driverId, setDriverId] = useState(edit?.driverUserId ? String(edit.driverUserId) : '');
  const [km, setKm] = useState(edit ? String(edit.km) : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const total = (Number(km) || 0) * pricePerKm;
  const save = useMutation({
    mutationFn: () => {
      const body = { driverUserId: driverId ? Number(driverId) : null, km: Number(km) || 0, notes: notes.trim() || null };
      return edit ? updateCitoyen(companyId, edit.id, body) : createCitoyen(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  const valid = Number(km) > 0;
  return (
    <Modal title={edit ? 'Modifier la course' : 'Nouvelle course citoyen'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <DriverSelect drivers={drivers} value={driverId} onChange={setDriverId} />
        <label className="text-sm"><span className={labelCls}>Kilomètres *</span><input type="number" min="0" step="0.01" className={inputCls} value={km} onChange={(e) => setKm(e.target.value)} placeholder="10.50" autoFocus /></label>
        <label className="text-sm"><span className={labelCls}>Prix/km</span><input className={`${inputCls} opacity-70`} value={`${fmtMoney(pricePerKm)} $`} readOnly /></label>
        <div className="col-span-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm"><span className="text-muted-foreground">Total estimé : </span><span className="font-semibold text-emerald-300">{fmtMoney(total)} $</span></div>
        <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Enregistrer la course'}</Button></div>
      </form>
    </Modal>
  );
}

function ConcitoyensTab({ companyId, canEdit, drivers, pricePerClient }: { companyId: number; canEdit: boolean; drivers: Driver[]; pricePerClient: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const w = weekRange();
  const [params, setParams] = useState<ListParams>({ from: w.from, to: w.to, sort: 'recent', page: 1 });
  const q = useQuery({ queryKey: ['taxi-concitoyens', companyId, params], queryFn: () => getConcitoyens(companyId, { ...params, limit: PAGE }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['taxi-concitoyens', companyId] });
  const [modal, setModal] = useState<{ open: boolean; edit: Concitoyen | null }>({ open: false, edit: null });
  const remove = useMutation({ mutationFn: (id: number) => deleteConcitoyen(companyId, id), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });
  const rows = q.data?.rows ?? []; const s = q.data?.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi icon={Users} label="Total courses" value={String(s?.count ?? 0)} />
        <Kpi icon={Users} label="Total clients" value={String(s?.clients ?? 0)} accent="text-emerald-400" />
        <Kpi icon={DollarSign} label="Total gains" value={`${fmtMoney(s?.revenue ?? 0)} $`} accent="text-sky-400" />
      </div>
      <FilterBar drivers={drivers} params={params} setParams={setParams} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Liste des courses concitoyens</h2>
        {canEdit && <Button onClick={() => setModal({ open: true, edit: null })}><Plus className="h-4 w-4" /> Ajouter une course</Button>}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12 rounded-lg" /><Skeleton className="h-12 rounded-lg" /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyState icon={Users} title="Aucune course" hint="Ajoute une course concitoyen." /></div>
          : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 text-left font-semibold">Date/heure</th><th className="px-4 py-3 text-left font-semibold">Chauffeur</th><th className="px-4 py-3 text-right font-semibold">Clients</th><th className="px-4 py-3 text-right font-semibold">Prix/client</th><th className="px-4 py-3 text-right font-semibold">Total</th><th className="px-4 py-3 text-right font-semibold"></th>
            </tr></thead><tbody>
              {rows.map((r) => <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/40">
                <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">{r.driverName || '—'}</td>
                <td className="px-4 py-3 text-right">{r.clients}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmtMoney(r.pricePerClient)} $</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmtMoney(r.total)} $</td>
                <td className="px-4 py-3"><RowActions onEdit={canEdit ? () => setModal({ open: true, edit: r }) : undefined} onDelete={canEdit ? async () => { if (await confirm({ title: 'Supprimer cette course ?', destructive: true })) remove.mutate(r.id); } : undefined} /></td>
              </tr>)}
            </tbody></table></div>}
        <Pager total={q.data?.total ?? 0} page={params.page ?? 1} onPage={(p) => setParams({ ...params, page: p })} />
      </div>
      {modal.open && <ConcitoyenModal companyId={companyId} edit={modal.edit} drivers={drivers} pricePerClient={pricePerClient} onClose={() => setModal({ open: false, edit: null })} onSaved={invalidate} />}
    </div>
  );
}

function ConcitoyenModal({ companyId, edit, drivers, pricePerClient, onClose, onSaved }: { companyId: number; edit: Concitoyen | null; drivers: Driver[]; pricePerClient: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [driverId, setDriverId] = useState(edit?.driverUserId ? String(edit.driverUserId) : '');
  const [clients, setClients] = useState(edit ? String(edit.clients) : '1');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const total = (Number(clients) || 0) * pricePerClient;
  const save = useMutation({
    mutationFn: () => {
      const body = { driverUserId: driverId ? Number(driverId) : null, clients: Number(clients) || 1, notes: notes.trim() || null };
      return edit ? updateConcitoyen(companyId, edit.id, body) : createConcitoyen(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  const valid = Number(clients) >= 1;
  return (
    <Modal title={edit ? 'Modifier la course' : 'Nouvelle course concitoyen'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <DriverSelect drivers={drivers} value={driverId} onChange={setDriverId} />
        <label className="text-sm"><span className={labelCls}>Nombre de clients *</span><input type="number" min="1" step="1" className={inputCls} value={clients} onChange={(e) => setClients(e.target.value)} autoFocus /></label>
        <label className="text-sm"><span className={labelCls}>Prix/client</span><input className={`${inputCls} opacity-70`} value={`${fmtMoney(pricePerClient)} $`} readOnly /></label>
        <div className="col-span-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm"><span className="text-muted-foreground">Total : </span><span className="font-semibold text-emerald-300">{fmtMoney(total)} $</span></div>
        <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
      </form>
    </Modal>
  );
}

function VipTab({ companyId, canEdit, drivers, vipTypes }: { companyId: number; canEdit: boolean; drivers: Driver[]; vipTypes: VipType[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const w = weekRange();
  const [params, setParams] = useState<ListParams>({ from: w.from, to: w.to, sort: 'recent', page: 1 });
  const q = useQuery({ queryKey: ['taxi-vip', companyId, params], queryFn: () => getVip(companyId, { ...params, limit: PAGE }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['taxi-vip', companyId] });
  const [modal, setModal] = useState<{ open: boolean; edit: Vip | null }>({ open: false, edit: null });
  const remove = useMutation({ mutationFn: (id: number) => deleteVip(companyId, id), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });
  const rows = q.data?.rows ?? []; const s = q.data?.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={Crown} label="Total courses VIP" value={String(s?.count ?? 0)} />
        <Kpi icon={DollarSign} label="Total revenus" value={`${fmtMoney(s?.revenue ?? 0)} $`} accent="text-emerald-400" />
      </div>
      <FilterBar drivers={drivers} params={params} setParams={setParams} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Liste des courses VIP</h2>
        {canEdit && <Button disabled={vipTypes.length === 0} onClick={() => setModal({ open: true, edit: null })}><Plus className="h-4 w-4" /> Ajouter une course</Button>}
      </div>
      {vipTypes.length === 0 && <div className="rounded-lg border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Aucun type VIP défini. Ajoute-en dans l’onglet Paramètres.</div>}
      <div className="overflow-hidden rounded-xl border bg-card">
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12 rounded-lg" /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyState icon={Crown} title="Aucune course VIP" hint="Ajoute une course VIP." /></div>
          : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 text-left font-semibold">Date/heure</th><th className="px-4 py-3 text-left font-semibold">Chauffeur</th><th className="px-4 py-3 text-left font-semibold">Type</th><th className="px-4 py-3 text-right font-semibold">Km</th><th className="px-4 py-3 text-right font-semibold">Total</th><th className="px-4 py-3 text-right font-semibold"></th>
            </tr></thead><tbody>
              {rows.map((r) => <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/40">
                <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">{r.driverName || '—'}</td>
                <td className="px-4 py-3">{r.typeName || '—'}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{r.km == null ? '—' : `${fmtMoney(r.km)} km`}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmtMoney(r.total)} $</td>
                <td className="px-4 py-3"><RowActions onEdit={canEdit ? () => setModal({ open: true, edit: r }) : undefined} onDelete={canEdit ? async () => { if (await confirm({ title: 'Supprimer cette course ?', destructive: true })) remove.mutate(r.id); } : undefined} /></td>
              </tr>)}
            </tbody></table></div>}
        <Pager total={q.data?.total ?? 0} page={params.page ?? 1} onPage={(p) => setParams({ ...params, page: p })} />
      </div>
      {modal.open && <VipModal companyId={companyId} edit={modal.edit} drivers={drivers} vipTypes={vipTypes} onClose={() => setModal({ open: false, edit: null })} onSaved={invalidate} />}
    </div>
  );
}

function VipModal({ companyId, edit, drivers, vipTypes, onClose, onSaved }: { companyId: number; edit: Vip | null; drivers: Driver[]; vipTypes: VipType[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [driverId, setDriverId] = useState(edit?.driverUserId ? String(edit.driverUserId) : '');
  const [typeId, setTypeId] = useState(edit?.typeId ? String(edit.typeId) : '');
  const [km, setKm] = useState(edit?.km != null ? String(edit.km) : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const type = vipTypes.find((t) => String(t.id) === typeId);
  const hasKm = type?.pricePerKm != null;
  const total = type ? type.fixedPrice + (hasKm ? (Number(km) || 0) * (type.pricePerKm ?? 0) : 0) : 0;
  const save = useMutation({
    mutationFn: () => {
      const body = { driverUserId: driverId ? Number(driverId) : null, typeId: Number(typeId), km: hasKm ? (Number(km) || 0) : null, notes: notes.trim() || null };
      return edit ? updateVip(companyId, edit.id, body) : createVip(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  const valid = !!typeId;
  return (
    <Modal title={edit ? 'Modifier la course VIP' : 'Nouvelle course VIP'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <DriverSelect drivers={drivers} value={driverId} onChange={setDriverId} />
        <label className="col-span-2 text-sm"><span className={labelCls}>Type de course *</span>
          <select className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)} autoFocus>
            <option value="">Choisir un type…</option>
            {vipTypes.map((t) => <option key={t.id} value={t.id}>{t.name} — {fmtMoney(t.fixedPrice)} ${t.pricePerKm != null ? ` + ${fmtMoney(t.pricePerKm)} $/km` : ''}</option>)}
          </select>
        </label>
        {hasKm && <label className="col-span-2 text-sm"><span className={labelCls}>Kilomètres</span><input type="number" min="0" step="0.01" className={inputCls} value={km} onChange={(e) => setKm(e.target.value)} /></label>}
        <div className="col-span-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm"><span className="text-muted-foreground">Total : </span><span className="font-semibold text-emerald-300">{fmtMoney(total)} $</span></div>
        <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer la course'}</Button></div>
      </form>
    </Modal>
  );
}

function SettingsTab({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const cfg = useQuery({ queryKey: ['taxi-config', companyId], queryFn: () => getTaxiConfig(companyId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['taxi-config', companyId] });
  const [ppk, setPpk] = useState('');
  const [ppc, setPpc] = useState('');
  const settings = cfg.data?.settings;
  const vipTypes = cfg.data?.vipTypes ?? [];
  const [typeModal, setTypeModal] = useState<{ open: boolean; edit: VipType | null }>({ open: false, edit: null });

  const saveSettings = useMutation({
    mutationFn: () => updateTaxiSettings(companyId, { pricePerKm: Number(ppk || settings?.pricePerKm || 20), pricePerClient: Number(ppc || settings?.pricePerClient || 605) }),
    onSuccess: () => { invalidate(); toast('Tarifs enregistrés.', 'success'); },
    onError: () => toast('Échec.', 'error'),
  });
  const removeType = useMutation({ mutationFn: (id: number) => deleteVipType(companyId, id), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Tarification des courses</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }}>
          <label className="text-sm"><span className={labelCls}>Prix d’une course citoyen (par km)</span>
            <input type="number" min="0" step="0.01" className={inputCls} value={ppk} onChange={(e) => setPpk(e.target.value)} placeholder={String(settings?.pricePerKm ?? 20)} />
          </label>
          <label className="text-sm"><span className={labelCls}>Prix d’une course concitoyen (par client)</span>
            <input type="number" min="0" step="0.01" className={inputCls} value={ppc} onChange={(e) => setPpc(e.target.value)} placeholder={String(settings?.pricePerClient ?? 605)} />
          </label>
          {canManage && <div className="sm:col-span-2"><Button type="submit" disabled={saveSettings.isPending}>{saveSettings.isPending ? 'Enregistrement…' : 'Enregistrer les tarifs'}</Button></div>}
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Types de courses VIP</h2>
          {canManage && <Button onClick={() => setTypeModal({ open: true, edit: null })}><Plus className="h-4 w-4" /> Ajouter un type</Button>}
        </div>
        {vipTypes.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Aucun type VIP.</div>
          : <table className="w-full border-collapse text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 text-left font-semibold">Nom</th><th className="px-5 py-3 text-right font-semibold">Prix fixe</th><th className="px-5 py-3 text-left font-semibold">Prix/km</th><th className="px-5 py-3 text-right font-semibold"></th>
            </tr></thead><tbody>
              {vipTypes.map((t) => <tr key={t.id} className="border-b last:border-b-0">
                <td className="px-5 py-3 font-medium">{t.name}</td>
                <td className="px-5 py-3 text-right">{fmtMoney(t.fixedPrice)} $</td>
                <td className="px-5 py-3">{t.pricePerKm == null ? <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Fixe uniquement</span> : `${fmtMoney(t.pricePerKm)} $/km`}</td>
                <td className="px-5 py-3"><RowActions onEdit={canManage ? () => setTypeModal({ open: true, edit: t }) : undefined} onDelete={canManage ? async () => { if (await confirm({ title: 'Supprimer ce type ?', message: t.name, destructive: true })) removeType.mutate(t.id); } : undefined} /></td>
              </tr>)}
            </tbody></table>}
      </div>

      {typeModal.open && <VipTypeModal companyId={companyId} edit={typeModal.edit} onClose={() => setTypeModal({ open: false, edit: null })} onSaved={invalidate} />}
    </div>
  );
}

function VipTypeModal({ companyId, edit, onClose, onSaved }: { companyId: number; edit: VipType | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [fixed, setFixed] = useState(edit ? String(edit.fixedPrice) : '');
  const [useKm, setUseKm] = useState(edit?.pricePerKm != null);
  const [perKm, setPerKm] = useState(edit?.pricePerKm != null ? String(edit.pricePerKm) : '');
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), fixedPrice: Number(fixed) || 0, pricePerKm: useKm ? (Number(perKm) || 0) : null };
      return edit ? updateVipType(companyId, edit.id, body) : createVipType(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  const valid = name.trim().length > 0;
  return (
    <Modal title={edit ? 'Modifier le type VIP' : 'Nouveau type VIP'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="col-span-2 text-sm"><span className={labelCls}>Nom *</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. limousine" autoFocus /></label>
        <label className="text-sm"><span className={labelCls}>Prix fixe ($)</span><input type="number" min="0" step="0.01" className={inputCls} value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="500" /></label>
        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={useKm} onChange={(e) => setUseKm(e.target.checked)} /> Ajouter un tarif au km</label>
        {useKm && <label className="text-sm"><span className={labelCls}>Prix/km ($)</span><input type="number" min="0" step="0.01" className={inputCls} value={perKm} onChange={(e) => setPerKm(e.target.value)} /></label>}
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
      </form>
    </Modal>
  );
}
