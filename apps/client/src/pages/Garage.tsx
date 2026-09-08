import { useEffect, useMemo, useState } from 'react';
import { frDay, weekRange } from '@/lib/bizWeek';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wrench, Car, Sparkles, FileText, Settings2, Check, Coins } from 'lucide-react';
import { useCompany } from '@/lib/useCompany';
import { fmtMoney, fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getGarageConfig, getGarageMembers, getGarageEarnings, getGarageModels, addGarageModel, deleteGarageModel,
  saveGarageSettings, addGarageType, updateGarageType,
  deleteGarageType, addGaragePack, deleteGaragePack, getGarageContracts, addGarageContract, updateGarageContract, deleteGarageContract,
  getGarageVehicles, addGarageVehicle, deleteGarageVehicle, getGarageRepairs, addGarageRepair, setRepairPaid,
  deleteGarageRepair, getGarageCustoms, addGarageCustom, setCustomPaid, deleteGarageCustom, getGarageBilling, setGarageContractPaid,
  type GarageVehicle, type GarageRepair, type GarageCustom, type GarageMember, type GarageConfig, type GarageContract,
} from '@/lib/garage';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtMoney(n)} $`;
const moneyInt = (n: number) => `${fmtInt(n)} $`;
const fmtDay = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

type Tab = 'repairs' | 'customs' | 'vehicles' | 'contracts' | 'paies';

interface RepairForm { mechanicUserId: number | ''; contractId: number | ''; clientName: string; plate: string; model: string; packId: number | ''; typeIds: number[]; km: string }
interface CustomForm { mechanicUserId: number | ''; contractId: number | ''; clientName: string; plate: string; model: string; cost: string; discount: string }
const EMPTY_REP: RepairForm = { mechanicUserId: '', contractId: '', clientName: '', plate: '', model: '', packId: '', typeIds: [], km: '0' };
const EMPTY_CUS: CustomForm = { mechanicUserId: '', contractId: '', clientName: '', plate: '', model: '', cost: '', discount: '0' };

export default function Garage() {
  const { company: mine, companyId, isLoading } = useCompany();
  const [tab, setTab] = useState<Tab>('repairs');
  const [showSettings, setShowSettings] = useState(false);
  // Formulaires levés au parent → conservés en mémoire quand on change d'onglet
  const [repairForm, setRepairForm] = useState<RepairForm>(EMPTY_REP);
  const [customForm, setCustomForm] = useState<CustomForm>(EMPTY_CUS);

  const cfg = useQuery({ queryKey: ['garage-config', companyId], queryFn: () => getGarageConfig(companyId), enabled: !!companyId });
  const membersQ = useQuery({ queryKey: ['garage-members', companyId], queryFn: () => getGarageMembers(companyId), enabled: !!companyId });
  const { user } = useAuth();

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (!mine) return <Navigate to="/" replace />;

  const canWrite = cfg.data?.canWrite ?? false;
  const canManage = cfg.data?.canManage ?? false;
  const members = membersQ.data?.members ?? [];
  const myMechId: number | '' = user && members.some((m) => m.userId === Number(user.id)) ? Number(user.id) : '';
  const GROUP1: { key: Tab; label: string; Icon: typeof Wrench }[] = [
    { key: 'repairs', label: 'Réparations', Icon: Wrench },
    { key: 'customs', label: 'Customs', Icon: Sparkles },
  ];
  const GROUP2: { key: Tab; label: string; Icon: typeof Wrench }[] = [
    { key: 'vehicles', label: 'Véhicules', Icon: Car },
    { key: 'contracts', label: 'Contrats', Icon: FileText },
    { key: 'paies', label: 'Paies', Icon: Coins },
  ];
  const TabBtn = ({ t }: { t: { key: Tab; label: string; Icon: typeof Wrench } }) => (
    <button type="button" onClick={() => { setShowSettings(false); setTab(t.key); }}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${!showSettings && tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      <t.Icon className="h-4 w-4" /> {t.label}
    </button>
  );

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Espace entreprise</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Garage</h1>
        </div>
        {canManage && (
          <Button variant={showSettings ? 'default' : 'outline'} onClick={() => setShowSettings((v) => !v)}>
            <Settings2 className="h-4 w-4" /> Paramètres
          </Button>
        )}
      </div>

      {!showSettings && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-1 rounded-xl bg-muted p-1">{GROUP1.map((t) => <TabBtn key={t.key} t={t} />)}</div>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <div className="inline-flex gap-1 rounded-xl bg-muted p-1">{GROUP2.map((t) => <TabBtn key={t.key} t={t} />)}</div>
        </div>
      )}

      {!cfg.data ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : showSettings && canManage ? (
        <SettingsTab companyId={companyId} canWrite={canManage} />
      ) : tab === 'repairs' ? (
        <RepairsTab companyId={companyId} canWrite={canWrite} cfg={cfg.data} members={members} form={repairForm} setForm={setRepairForm} myMechId={myMechId} />
      ) : tab === 'customs' ? (
        <CustomsTab companyId={companyId} canWrite={canWrite} cfg={cfg.data} members={members} form={customForm} setForm={setCustomForm} myMechId={myMechId} />
      ) : tab === 'vehicles' ? (
        <VehiclesTab companyId={companyId} canWrite={canWrite} />
      ) : tab === 'contracts' ? (
        <ContractsTab companyId={companyId} canWrite={canManage} />
      ) : (
        <PaiesTab companyId={companyId} commissionPct={cfg.data.settings.commissionPct} />
      )}
    </div>
  );
}

function useContracts(companyId: number) {
  return useQuery({ queryKey: ['garage-contracts', companyId], queryFn: () => getGarageContracts(companyId), enabled: !!companyId });
}
function useVehicleSearch(companyId: number, q: string) {
  return useQuery({ queryKey: ['garage-veh-search', companyId, q], queryFn: () => getGarageVehicles(companyId, q), enabled: !!companyId && q.length >= 1 });
}

function MechanicSelect({ members, value, onChange }: { members: GarageMember[]; value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
      <option value="">Mécanicien…</option>
      {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}{m.gradeName ? ` (${m.gradeName})` : ''}</option>)}
    </select>
  );
}
function ContractSelect({ companyId, value, onChange }: { companyId: number; value: number | ''; onChange: (v: number | '') => void }) {
  const q = useContracts(companyId);
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
      <option value="">Aucun contrat (Particulier)</option>
      {(q.data?.contracts ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
function PlateField({ companyId, plate, onPlate, onPick }: { companyId: number; plate: string; onPlate: (v: string) => void; onPick: (v: GarageVehicle) => void }) {
  const [open, setOpen] = useState(false);
  const res = useVehicleSearch(companyId, plate);
  const vehicles = res.data?.vehicles ?? [];
  return (
    <div className="relative">
      <input className={inputCls} value={plate} placeholder="Ex: LS-1234"
        onChange={(e) => { onPlate(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && vehicles.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-card shadow-lg">
          {vehicles.map((v) => (
            <button key={v.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={() => { onPick(v); setOpen(false); }}>
              <span className="font-medium">{v.plate}</span>
              <span className="text-muted-foreground"> · {v.model || '—'} · {[v.ownerFirstName, v.ownerLastName].filter(Boolean).join(' ') || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelField({ companyId, value, onChange }: { companyId: number; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const res = useQuery({ queryKey: ['garage-models', companyId, value], queryFn: () => getGarageModels(companyId, value), enabled: !!companyId && value.length >= 1 });
  const models = res.data?.models ?? [];
  const trimmed = value.trim();
  const exactExists = models.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
  const showAdd = (res.data?.canWrite ?? false) && trimmed.length >= 2 && !exactExists;
  const add = useMutation({
    mutationFn: () => addGarageModel(companyId, { name: trimmed }),
    onSuccess: () => { toast(`« ${trimmed} » ajouté à la base.`, 'success'); queryClient.invalidateQueries({ queryKey: ['garage-models', companyId] }); setOpen(false); },
    onError: () => toast("Échec de l'ajout.", 'error'),
  });
  return (
    <div className="relative">
      <input className={inputCls} value={value} placeholder="Ex: Sultan RS (saisie libre)"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (models.length > 0 || showAdd) && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-card shadow-lg">
          {models.map((m) => (
            <button key={m.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={() => { onChange(m.name); setOpen(false); }}>
              <span className="font-medium">{m.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{m.manufacturer || ''}{m.category ? ` · ${m.category}` : ''}</span>
            </button>
          ))}
          {showAdd && (
            <button type="button" className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); add.mutate(); }}>
              <Plus className="h-3.5 w-3.5" /> Ajouter « {trimmed} » à la base
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RepairsTab({ companyId, canWrite, cfg, members, form, setForm, myMechId }: {
  companyId: number; canWrite: boolean; cfg: GarageConfig; members: GarageMember[];
  form: RepairForm; setForm: React.Dispatch<React.SetStateAction<RepairForm>>; myMechId: number | '';
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['garage-repairs', companyId], queryFn: () => getGarageRepairs(companyId) });
  const patch = (p: Partial<RepairForm>) => setForm((f) => ({ ...f, ...p }));
  useEffect(() => {
    if (myMechId !== '') setForm((f) => (f.mechanicUserId === '' ? { ...f, mechanicUserId: myMechId } : f));
  }, [myMechId, setForm]);

  const { types, packs, settings } = cfg;
  const perKm = settings.depannagePerKm, mult = settings.depannageMultiplier, commPct = settings.commissionPct;

  const contractsQ = useContracts(companyId);
  const contract = form.contractId ? contractsQ.data?.contracts.find((c) => c.id === form.contractId) : null;
  const cTypePrice = useMemo(() => {
    const m = new Map<number, number>();
    for (const pr of contract?.prices ?? []) if (pr.typeId != null) m.set(pr.typeId, pr.price);
    return m;
  }, [contract]);
  const cPackPrice = useMemo(() => {
    const m = new Map<number, number>();
    for (const pr of contract?.prices ?? []) if (pr.packId != null) m.set(pr.packId, pr.price);
    return m;
  }, [contract]);

  const kmN = Math.min(100000, Math.max(0, Math.round(Number(form.km) || 0)));
  const total = useMemo(() => {
    let base = 0;
    if (form.packId) {
      const p = packs.find((x) => x.id === form.packId);
      base = p ? (cPackPrice.get(p.id) ?? p.price) : 0;
    } else {
      base = form.typeIds.reduce((s, id) => {
        const t = types.find((x) => x.id === id);
        return s + (t ? (cTypePrice.get(t.id) ?? t.price) : 0);
      }, 0);
    }
    return Math.round(base + kmN * perKm * mult);
  }, [form.packId, form.typeIds, kmN, types, packs, perKm, mult, cTypePrice, cPackPrice]);
  const mechRate = members.find((m) => m.userId === form.mechanicUserId)?.commissionRate ?? null;
  const effectivePct = mechRate && mechRate > 0 ? mechRate : commPct;
  const commission = Math.round((total * effectivePct) / 100);

  const add = useMutation({
    mutationFn: () => addGarageRepair(companyId, {
      mechanicUserId: form.mechanicUserId || undefined,
      mechanicName: members.find((m) => m.userId === form.mechanicUserId)?.name || undefined,
      contractId: form.contractId || undefined, clientName: form.clientName.trim() || undefined,
      plate: form.plate.trim() || undefined, model: form.model.trim() || undefined,
      packId: form.packId || undefined, typeIds: form.packId ? undefined : form.typeIds,
      depannageKm: kmN,
    }),
    onSuccess: () => { toast('Réparation enregistrée.', 'success'); setForm({ ...EMPTY_REP, mechanicUserId: myMechId }); queryClient.invalidateQueries({ queryKey: ['garage-repairs', companyId] }); queryClient.invalidateQueries({ queryKey: ['garage-earnings', companyId] }); },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });
  const paidM = useMutation({ mutationFn: (v: { id: number; paid: boolean }) => setRepairPaid(companyId, v.id, v.paid), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['garage-repairs', companyId] }) });
  const delM = useMutation({ mutationFn: (id: number) => deleteGarageRepair(companyId, id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['garage-repairs', companyId] }); queryClient.invalidateQueries({ queryKey: ['garage-earnings', companyId] }); } });

  const valid = form.packId !== '' || form.typeIds.length > 0 || kmN > 0;
  const repairs = list.data?.repairs ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canWrite && (
        <form className="space-y-4 rounded-2xl border bg-card p-6" onSubmit={(e) => { e.preventDefault(); if (valid && !add.isPending) add.mutate(); }}>
          <h3 className="text-sm font-semibold">Nouvelle réparation</h3>
          <Field label="Mécanicien"><MechanicSelect members={members} value={form.mechanicUserId} onChange={(v) => patch({ mechanicUserId: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contrat / entreprise"><ContractSelect companyId={companyId} value={form.contractId} onChange={(v) => patch({ contractId: v })} /></Field>
            <Field label="Nom du client"><input className={inputCls} value={form.clientName} onChange={(e) => patch({ clientName: e.target.value })} placeholder="Optionnel" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plaque"><PlateField companyId={companyId} plate={form.plate} onPlate={(v) => patch({ plate: v })} onPick={(v) => patch({ plate: v.plate, model: v.model || '', clientName: [v.ownerFirstName, v.ownerLastName].filter(Boolean).join(' ') })} /></Field>
            <Field label="Modèle"><ModelField companyId={companyId} value={form.model} onChange={(v) => patch({ model: v })} /></Field>
          </div>
          <Field label="Pack (optionnel — désactive les types)">
            <select className={inputCls} value={form.packId} onChange={(e) => patch({ packId: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Aucun pack sélectionné</option>
              {packs.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(cPackPrice.get(p.id) ?? p.price)}</option>)}
            </select>
          </Field>
          {contract && <p className="-mt-1 text-xs text-sky-400">Tarifs du contrat « {contract.name} » appliqués.</p>}
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => {
              const price = cTypePrice.get(t.id) ?? t.price;
              const overridden = cTypePrice.has(t.id) && price !== t.price;
              return (
              <label key={t.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.packId ? 'opacity-40' : 'cursor-pointer hover:border-primary/50'}`}>
                <input type="checkbox" disabled={!!form.packId} checked={form.typeIds.includes(t.id)}
                  onChange={(e) => patch({ typeIds: e.target.checked ? [...form.typeIds, t.id] : form.typeIds.filter((x) => x !== t.id) })} />
                <span className="font-medium">{t.name}</span>
                <span className="text-primary">{money(price)}</span>
                {overridden && <span className="text-[10px] text-muted-foreground line-through">{money(t.price)}</span>}
              </label>
              );
            })}
          </div>
          <Field label={`Dépannage (KM) — ${money(perKm)}/km ×${mult}`}>
            <input type="number" min="0" className={inputCls} value={form.km} onChange={(e) => patch({ km: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <div><div className="text-xs text-muted-foreground">Prix total</div><div className="text-xl font-bold text-emerald-400">{money(total)}</div></div>
            <div className="text-right"><div className="text-xs text-muted-foreground">Commission ({effectivePct}%)</div><div className="text-sm font-semibold text-sky-400">{moneyInt(commission)}</div></div>
          </div>
          <Button type="submit" className="w-full" disabled={!valid || add.isPending}>{add.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </form>
      )}

      <div className={`rounded-2xl border bg-card p-6 ${canWrite ? '' : 'lg:col-span-2'}`}>
        <h3 className="mb-3 text-sm font-semibold">Historique réparations</h3>
        {repairs.length === 0 ? <EmptyState icon={Wrench} title="Aucune réparation" hint="Enregistre ta première réparation." /> : (
          <div className="space-y-2">
            {repairs.map((r: GarageRepair) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.plate || '—'} <span className="font-normal text-muted-foreground">{r.model ? `· ${r.model}` : ''}</span></div>
                  <div className="truncate text-xs text-muted-foreground">{fmtDay(r.createdAt)} · {r.mechanicName || '—'} · {r.packName || (Array.isArray(r.items) ? r.items.map((i) => i.name).join(', ') : '') || '—'}{r.depannageKm ? ` · ${r.depannageKm}km` : ''} · comm. {moneyInt(r.commissionAmount)}</div>
                </div>
                <span className="font-semibold text-emerald-400">{money(r.total)}</span>
                {canWrite && <button type="button" onClick={() => paidM.mutate({ id: r.id, paid: !r.paid })} className={`rounded-full border px-2 py-0.5 text-xs ${r.paid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'text-muted-foreground'}`}>{r.paid ? 'Payé' : 'Impayé'}</button>}
                {canWrite && <button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer ?', message: r.plate || '', destructive: true })) delM.mutate(r.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomsTab({ companyId, canWrite, cfg, members, form, setForm, myMechId }: {
  companyId: number; canWrite: boolean; cfg: GarageConfig; members: GarageMember[];
  form: CustomForm; setForm: React.Dispatch<React.SetStateAction<CustomForm>>; myMechId: number | '';
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['garage-customs', companyId], queryFn: () => getGarageCustoms(companyId) });
  const patch = (p: Partial<CustomForm>) => setForm((f) => ({ ...f, ...p }));
  useEffect(() => {
    if (myMechId !== '') setForm((f) => (f.mechanicUserId === '' ? { ...f, mechanicUserId: myMechId } : f));
  }, [myMechId, setForm]);
  const margin = cfg.settings.customMarginPct, commPct = cfg.settings.commissionPct;

  const costN = Number(form.cost) || 0;
  const discN = Math.min(100, Math.max(0, Number(form.discount) || 0));
  const finalPrice = Math.round(costN * (1 + margin / 100) * (1 - discN / 100));
  const profit = Math.round(finalPrice - costN);
  const mechRate = members.find((m) => m.userId === form.mechanicUserId)?.commissionRate ?? null;
  const effectivePct = mechRate && mechRate > 0 ? mechRate : commPct;
  const commission = Math.round((Math.max(0, profit) * effectivePct) / 100);

  const add = useMutation({
    mutationFn: () => addGarageCustom(companyId, {
      mechanicUserId: form.mechanicUserId || undefined,
      mechanicName: members.find((m) => m.userId === form.mechanicUserId)?.name || undefined,
      contractId: form.contractId || undefined, clientName: form.clientName.trim() || undefined,
      plate: form.plate.trim() || undefined, model: form.model.trim() || undefined, costPrice: costN, discountPct: discN,
    }),
    onSuccess: () => { toast('Custom enregistré.', 'success'); setForm({ ...EMPTY_CUS, mechanicUserId: myMechId }); queryClient.invalidateQueries({ queryKey: ['garage-customs', companyId] }); queryClient.invalidateQueries({ queryKey: ['garage-earnings', companyId] }); },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });
  const paidM = useMutation({ mutationFn: (v: { id: number; paid: boolean }) => setCustomPaid(companyId, v.id, v.paid), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['garage-customs', companyId] }) });
  const delM = useMutation({ mutationFn: (id: number) => deleteGarageCustom(companyId, id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['garage-customs', companyId] }); queryClient.invalidateQueries({ queryKey: ['garage-earnings', companyId] }); } });

  const valid = form.model.trim().length > 0 && form.plate.trim().length > 0 && form.cost !== '';
  const customs = list.data?.customs ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canWrite && (
        <form className="space-y-4 rounded-2xl border bg-card p-6" onSubmit={(e) => { e.preventDefault(); if (valid && !add.isPending) add.mutate(); }}>
          <h3 className="text-sm font-semibold">Nouveau custom</h3>
          <Field label="Mécanicien"><MechanicSelect members={members} value={form.mechanicUserId} onChange={(v) => patch({ mechanicUserId: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contrat / entreprise"><ContractSelect companyId={companyId} value={form.contractId} onChange={(v) => patch({ contractId: v })} /></Field>
            <Field label="Nom du client"><input className={inputCls} value={form.clientName} onChange={(e) => patch({ clientName: e.target.value })} placeholder="Optionnel" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plaque *"><PlateField companyId={companyId} plate={form.plate} onPlate={(v) => patch({ plate: v })} onPick={(v) => patch({ plate: v.plate, model: v.model || '', clientName: [v.ownerFirstName, v.ownerLastName].filter(Boolean).join(' ') })} /></Field>
            <Field label="Modèle *"><ModelField companyId={companyId} value={form.model} onChange={(v) => patch({ model: v })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix de revient (Bennys/LS) *"><input type="number" step="0.01" min="0" className={inputCls} value={form.cost} onChange={(e) => patch({ cost: e.target.value })} placeholder="0" /></Field>
            <Field label="Réduction (%)"><input type="number" step="1" min="0" max="100" className={inputCls} value={form.discount} onChange={(e) => patch({ discount: e.target.value })} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <div><div className="text-xs text-muted-foreground">Prix final (marge +{margin}%)</div><div className="text-xl font-bold text-emerald-400">{money(finalPrice)}</div></div>
            <div className="text-right text-xs"><div>Bénéfice : <span className="font-semibold text-emerald-400">{money(profit)}</span></div><div>Commission ({effectivePct}%) : <span className="font-semibold text-sky-400">{moneyInt(commission)}</span></div></div>
          </div>
          <Button type="submit" className="w-full" disabled={!valid || add.isPending}>{add.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </form>
      )}

      <div className={`rounded-2xl border bg-card p-6 ${canWrite ? '' : 'lg:col-span-2'}`}>
        <h3 className="mb-3 text-sm font-semibold">Historique customs</h3>
        {customs.length === 0 ? <EmptyState icon={Sparkles} title="Aucun custom" hint="Enregistre ton premier custom." /> : (
          <div className="space-y-2">
            {customs.map((c: GarageCustom) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.plate || '—'} <span className="font-normal text-muted-foreground">{c.model ? `· ${c.model}` : ''}</span></div>
                  <div className="truncate text-xs text-muted-foreground">{fmtDay(c.createdAt)} · {c.mechanicName || '—'} · bénéf {money(c.profit)} · comm. {moneyInt(c.commissionAmount)}</div>
                </div>
                <span className="font-semibold text-emerald-400">{money(c.finalPrice)}</span>
                {canWrite && <button type="button" onClick={() => paidM.mutate({ id: c.id, paid: !c.paid })} className={`rounded-full border px-2 py-0.5 text-xs ${c.paid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'text-muted-foreground'}`}>{c.paid ? 'Payé' : 'Impayé'}</button>}
                {canWrite && <button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer ?', message: c.plate || '', destructive: true })) delM.mutate(c.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaiesTab({ companyId, commissionPct }: { companyId: number; commissionPct: number }) {
  const q = useQuery({ queryKey: ['garage-earnings', companyId], queryFn: () => getGarageEarnings(companyId) });
  const rows = q.data?.earnings ?? [];
  const totalComm = rows.reduce((s, r) => s + r.commission, 0);
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Paies par employé <span className="text-muted-foreground">· commission {commissionPct}%</span></h3>
        <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-300">Total : {moneyInt(totalComm)}</span>
      </div>
      {rows.length === 0 ? <EmptyState icon={Coins} title="Aucune paie" hint="Les commissions apparaissent dès qu'un mécanicien fait une réparation ou un custom." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Employé</th><th className="py-2 pr-3 text-right font-medium">Prestations</th>
              <th className="py-2 pr-3 text-right font-medium">CA généré</th><th className="py-2 text-right font-medium">Commission à payer</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{r.count}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(r.revenue)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-sky-400">{moneyInt(r.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VehiclesTab({ companyId, canWrite }: { companyId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ['garage-vehicles', companyId], queryFn: () => getGarageVehicles(companyId) });
  const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [model, setModel] = useState(''); const [plate, setPlate] = useState('');
  const add = useMutation({
    mutationFn: () => addGarageVehicle(companyId, { ownerFirstName: first.trim() || undefined, ownerLastName: last.trim() || undefined, model: model.trim() || undefined, plate: plate.trim() }),
    onSuccess: () => { toast('Véhicule ajouté.', 'success'); setFirst(''); setLast(''); setModel(''); setPlate(''); queryClient.invalidateQueries({ queryKey: ['garage-vehicles', companyId] }); },
    onError: () => toast('Échec.', 'error'),
  });
  const delM = useMutation({ mutationFn: (id: number) => deleteGarageVehicle(companyId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['garage-vehicles', companyId] }) });
  const vehicles = list.data?.vehicles ?? [];
  return (
    <div className="space-y-4">
      {canWrite && (
        <form className="grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (plate.trim() && !add.isPending) add.mutate(); }}>
          <input className={inputCls} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Prénom" />
          <input className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Nom" />
          <ModelField companyId={companyId} value={model} onChange={setModel} />
          <input className={inputCls} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Plaque *" />
          <Button type="submit" disabled={!plate.trim() || add.isPending}><Plus className="h-4 w-4" /> Ajouter</Button>
        </form>
      )}
      <div className="rounded-2xl border bg-card p-6">
        {vehicles.length === 0 ? <EmptyState icon={Car} title="Aucune fiche véhicule" hint="Ajoute une fiche : propriétaire, modèle, plaque." /> : (
          <div className="space-y-1.5">
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                <span className="w-24 shrink-0 font-mono font-semibold">{v.plate}</span>
                <span className="flex-1 truncate">{v.model || '—'} <span className="text-muted-foreground">· {[v.ownerFirstName, v.ownerLastName].filter(Boolean).join(' ') || '—'}</span></span>
                {canWrite && <button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer ?', message: v.plate, destructive: true })) delM.mutate(v.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function billingWeek(offset: number): { from: string; to: string; label: string } {
  const { from, to } = weekRange(new Date(), offset);
  return { from, to, label: `${frDay(from)} → ${frDay(to)}` };
}

function GarageBilling({ companyId }: { companyId: number }) {
  const [offset, setOffset] = useState(0);
  const wk = billingWeek(offset);
  const q = useQuery({ queryKey: ['garage-billing', companyId, wk.from, wk.to], queryFn: () => getGarageBilling(companyId, wk.from, wk.to) });
  const qc = useQueryClient();
  const togglePaid = useMutation({
    mutationFn: (v: { contractId: number; paid: boolean }) => setGarageContractPaid(companyId, v.contractId, wk.from, v.paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['garage-billing', companyId] }),
  });
  const rows = (q.data?.rows ?? []).filter((r) => r.repairsCount + r.customsCount > 0);
  const grand = rows.reduce((a, r) => a + r.total, 0);
  const nav = 'grid h-8 w-8 place-items-center rounded-md border text-sm disabled:opacity-40 hover:bg-accent';
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Facturation partenaires</h3>
          <p className="text-xs text-muted-foreground">Réparations + customs rattachés à chaque contrat, à facturer en fin de semaine.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => setOffset((o) => o - 1)} className={nav}>‹</button>
          <span className="min-w-[9rem] text-center font-medium">{offset === 0 ? 'Semaine actuelle' : wk.label}</span>
          <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} className={nav}>›</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">Aucune prestation rattachée à un contrat sur cette semaine.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-semibold">Partenaire</th>
                <th className="py-2 text-right font-semibold">Réparations</th>
                <th className="py-2 text-right font-semibold">Customs</th>
                <th className="py-2 text-right font-semibold">À facturer</th>
                <th className="py-2 text-right font-semibold">Réglé</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.contractId} className="border-b last:border-b-0">
                  <td className="py-2 font-medium">{r.name}{r.active ? '' : ' (inactif)'}</td>
                  <td className="py-2 text-right text-muted-foreground">{r.repairsCount ? `${fmtInt(r.repairsTotal)} $ · ${r.repairsCount}` : '—'}</td>
                  <td className="py-2 text-right text-muted-foreground">{r.customsCount ? `${fmtInt(r.customsTotal)} $ · ${r.customsCount}` : '—'}</td>
                  <td className={`py-2 text-right font-semibold ${r.paid ? 'text-muted-foreground line-through' : 'text-emerald-400'}`}>{fmtInt(r.total)} $</td>
                  <td className="py-2 text-right">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={r.paid}
                      disabled={togglePaid.isPending}
                      onChange={(e) => togglePaid.mutate({ contractId: r.contractId, paid: e.target.checked })} />
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="py-2" colSpan={3}>Total à facturer</td>
                <td className="py-2 text-right text-emerald-400">{fmtInt(grand)} $</td>
                <td className="py-2 text-right text-xs text-muted-foreground">{fmtInt(q.data?.paidTotal ?? 0)} $ réglé{(q.data?.paidTotal ?? 0) > 1 ? 's' : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContractsTab({ companyId, canWrite }: { companyId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useContracts(companyId);
  const cfg = useQuery({ queryKey: ['garage-config', companyId], queryFn: () => getGarageConfig(companyId) });
  const types = cfg.data?.types ?? [];
  const packs = cfg.data?.packs ?? [];
  const contracts = list.data?.contracts ?? [];

  const [editing, setEditing] = useState<null | number | 'new'>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [typePrices, setTypePrices] = useState<Record<number, string>>({});
  const [packPrices, setPackPrices] = useState<Record<number, string>>({});

  const inv = () => queryClient.invalidateQueries({ queryKey: ['garage-contracts', companyId] });

  function openNew() {
    setName(''); setDesc('');
    setTypePrices(Object.fromEntries(types.map((t) => [t.id, String(t.price)])));
    setPackPrices(Object.fromEntries(packs.map((p) => [p.id, String(p.price)])));
    setEditing('new');
  }
  function openEdit(c: GarageContract) {
    setName(c.name); setDesc(c.description || '');
    const tp: Record<number, string> = Object.fromEntries(types.map((t) => [t.id, String(t.price)]));
    const pp: Record<number, string> = Object.fromEntries(packs.map((p) => [p.id, String(p.price)]));
    for (const pr of c.prices) {
      if (pr.typeId != null) tp[pr.typeId] = String(pr.price);
      if (pr.packId != null) pp[pr.packId] = String(pr.price);
    }
    setTypePrices(tp); setPackPrices(pp); setEditing(c.id);
  }

  const save = useMutation({
    mutationFn: () => {
      const hasNum = (raw: string | undefined) => raw != null && raw.trim() !== '' && Number.isFinite(Number(raw));
      const prices = [
        ...types
          .map((t) => ({ typeId: t.id, raw: typePrices[t.id], std: t.price }))
          .filter((x) => hasNum(x.raw) && Number(x.raw) >= 0 && Number(x.raw) !== x.std)
          .map((x) => ({ typeId: x.typeId, price: Number(x.raw) })),
        ...packs
          .map((p) => ({ packId: p.id, raw: packPrices[p.id], std: p.price }))
          .filter((x) => hasNum(x.raw) && Number(x.raw) >= 0 && Number(x.raw) !== x.std)
          .map((x) => ({ packId: x.packId, price: Number(x.raw) })),
      ];
      const body = { name: name.trim(), description: desc.trim() || undefined, prices };
      return editing === 'new' ? addGarageContract(companyId, body) : updateGarageContract(companyId, editing as number, body);
    },
    onSuccess: () => { toast('Contrat enregistré.', 'success'); setEditing(null); inv(); },
    onError: () => toast('Échec.', 'error'),
  });
  const delM = useMutation({ mutationFn: (id: number) => deleteGarageContract(companyId, id), onSuccess: inv });

  if (editing !== null) {
    return (
      <div className="space-y-5 rounded-2xl border bg-card p-6">
        <h3 className="text-sm font-semibold">{editing === 'new' ? 'Nouveau contrat' : 'Modifier le contrat'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du contrat *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description"><input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optionnel" /></Field>
        </div>
        <p className="text-xs text-muted-foreground">Tarifs négociés pour ce contrat (pré-remplis aux prix standard). Ils remplacent les prix par défaut quand une prestation est facturée à ce contrat.</p>
        {types.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Réparations</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {types.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="flex-1 truncate text-sm">{t.name}</span>
                  <input type="number" step="0.01" min="0" className={`${inputCls} w-28`} value={typePrices[t.id] ?? ''} onChange={(e) => setTypePrices((s) => ({ ...s, [t.id]: e.target.value }))} />
                  <span className="text-xs text-muted-foreground">$</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {packs.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packs</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {packs.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="flex-1 truncate text-sm">{p.name}</span>
                  <input type="number" step="0.01" min="0" className={`${inputCls} w-28`} value={packPrices[p.id] ?? ''} onChange={(e) => setPackPrices((s) => ({ ...s, [p.id]: e.target.value }))} />
                  <span className="text-xs text-muted-foreground">$</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}><Check className="h-4 w-4" /> {save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
          <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GarageBilling companyId={companyId} />
      {canWrite && <Button onClick={openNew} disabled={!cfg.data}><Plus className="h-4 w-4" /> Nouveau contrat</Button>}
      <div className="rounded-2xl border bg-card p-6">
        {contracts.length === 0 ? <EmptyState icon={FileText} title="Aucun contrat" hint="Crée un contrat pour définir des tarifs préférentiels à une entreprise." /> : (
          <div className="space-y-1.5">
            {contracts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.description || ''}{c.prices.length ? ` · ${c.prices.length} tarif(s) perso` : ' · tarifs standard'}</div>
                </div>
                {canWrite && <Button variant="outline" size="sm" onClick={() => openEdit(c)}>Modifier</Button>}
                {canWrite && <button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer ?', message: c.name, destructive: true })) delM.mutate(c.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsTab({ companyId, canWrite }: { companyId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['garage-config', companyId], queryFn: () => getGarageConfig(companyId) });
  const s = cfg.data?.settings;
  const [perKm, setPerKm] = useState(''); const [mult, setMult] = useState(''); const [margin, setMargin] = useState(''); const [comm, setComm] = useState('');
  const [tName, setTName] = useState(''); const [tPrice, setTPrice] = useState('');
  const [pName, setPName] = useState(''); const [pPrice, setPPrice] = useState('');
  const inv = () => queryClient.invalidateQueries({ queryKey: ['garage-config', companyId] });
  const numField = (v: string, cur: number | undefined, def: number) => {
    if (v.trim() === '') return cur ?? def;
    const n = Number(v);
    return Number.isFinite(n) ? n : (cur ?? def);
  };

  const saveS = useMutation({
    mutationFn: () => saveGarageSettings(companyId, { depannagePerKm: numField(perKm, s?.depannagePerKm, 25), depannageMultiplier: numField(mult, s?.depannageMultiplier, 2), customMarginPct: numField(margin, s?.customMarginPct, 25), commissionPct: numField(comm, s?.commissionPct, 30) }),
    onSuccess: () => { toast('Paramètres enregistrés.', 'success'); inv(); },
    onError: () => toast('Échec.', 'error'),
  });
  const addT = useMutation({ mutationFn: () => addGarageType(companyId, { name: tName.trim(), price: Number(tPrice) || 0 }), onSuccess: () => { setTName(''); setTPrice(''); inv(); }, onError: () => toast('Type déjà existant ?', 'error') });
  const delT = useMutation({ mutationFn: (id: number) => deleteGarageType(companyId, id), onSuccess: inv });
  const patchT = useMutation({ mutationFn: (v: { id: number; price: number }) => updateGarageType(companyId, v.id, { price: v.price }), onSuccess: inv });
  const addP = useMutation({ mutationFn: () => addGaragePack(companyId, { name: pName.trim(), price: Number(pPrice) || 0 }), onSuccess: () => { setPName(''); setPPrice(''); inv(); } });
  const delP = useMutation({ mutationFn: (id: number) => deleteGaragePack(companyId, id), onSuccess: inv });

  if (!cfg.data) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  if (!canWrite) return <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Tu n'as pas les droits pour modifier les paramètres.</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <h3 className="text-sm font-semibold">Tarifs & commission</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dépannage $/km"><input type="number" step="0.01" className={inputCls} defaultValue={s?.depannagePerKm} onChange={(e) => setPerKm(e.target.value)} /></Field>
          <Field label="× (aller-retour)"><input type="number" step="1" min="1" className={inputCls} defaultValue={s?.depannageMultiplier} onChange={(e) => setMult(e.target.value)} /></Field>
          <Field label="Marge custom %"><input type="number" step="1" className={inputCls} defaultValue={s?.customMarginPct} onChange={(e) => setMargin(e.target.value)} /></Field>
          <Field label="Commission employé %"><input type="number" step="1" className={inputCls} defaultValue={s?.commissionPct} onChange={(e) => setComm(e.target.value)} /></Field>
        </div>
        <Button onClick={() => saveS.mutate()} disabled={saveS.isPending}><Check className="h-4 w-4" /> Enregistrer</Button>

        <h3 className="pt-2 text-sm font-semibold">Packs de réparation</h3>
        <div className="space-y-1.5">
          {cfg.data.packs.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="flex-1 font-medium">{p.name}</span><span className="text-primary">{money(p.price)}</span>
              <button type="button" onClick={() => delP.mutate(p.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pName.trim()) addP.mutate(); }}>
          <input className={inputCls} value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nom du pack" />
          <input type="number" className={`${inputCls} w-28`} value={pPrice} onChange={(e) => setPPrice(e.target.value)} placeholder="Prix" />
          <Button type="submit" disabled={!pName.trim()}><Plus className="h-4 w-4" /></Button>
        </form>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <h3 className="text-sm font-semibold">Types de réparation</h3>
        <div className="space-y-1.5">
          {cfg.data.types.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="flex-1 font-medium">{t.name}</span>
              <input type="number" step="0.01" defaultValue={t.price} className={`${inputCls} w-24`} onBlur={(e) => { const raw = e.target.value.trim(); if (raw === '') { e.target.value = String(t.price); return; } const v = Number(raw); if (Number.isFinite(v) && v >= 0 && v !== t.price) patchT.mutate({ id: t.id, price: v }); }} />
              <span className="text-muted-foreground">$</span>
              <button type="button" onClick={() => delT.mutate(t.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tName.trim()) addT.mutate(); }}>
          <input className={inputCls} value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Nom du type" />
          <input type="number" className={`${inputCls} w-28`} value={tPrice} onChange={(e) => setTPrice(e.target.value)} placeholder="Prix" />
          <Button type="submit" disabled={!tName.trim()}><Plus className="h-4 w-4" /></Button>
        </form>
      </div>
      </div>
      <ModelsManager companyId={companyId} />
    </div>
  );
}

function ModelsManager({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['garage-models-mgmt', companyId, q], queryFn: () => getGarageModels(companyId, q) });
  const models = list.data?.models ?? [];
  const canManage = list.data?.canManageCatalog ?? false;
  const [name, setName] = useState('');
  const [man, setMan] = useState('');
  const [cat, setCat] = useState('');
  const inv = () => queryClient.invalidateQueries({ queryKey: ['garage-models-mgmt', companyId] });
  const add = useMutation({
    mutationFn: () => addGarageModel(companyId, { name: name.trim(), manufacturer: man.trim() || undefined, category: cat.trim() || undefined }),
    onSuccess: () => { toast('Modèle ajouté.', 'success'); setName(''); setMan(''); setCat(''); inv(); },
    onError: () => toast('Échec.', 'error'),
  });
  const delM = useMutation({ mutationFn: (id: number) => deleteGarageModel(companyId, id), onSuccess: inv, onError: () => toast('Suppression réservée au staff.', 'error') });
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Base de véhicules <span className="text-muted-foreground">· ~800 modèles GTA</span></h3>
        <input className={`${inputCls} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Rechercher un modèle…" />
      </div>
      <form className="mb-3 grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Modèle *" />
        <input className={inputCls} value={man} onChange={(e) => setMan(e.target.value)} placeholder="Constructeur" />
        <input className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Catégorie" />
        <Button type="submit" disabled={!name.trim()}><Plus className="h-4 w-4" /> Ajouter</Button>
      </form>
      <div className="max-h-80 space-y-1 overflow-auto">
        {models.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
            <span className="flex-1 font-medium">{m.name}</span>
            <span className="text-xs text-muted-foreground">{m.manufacturer || '—'}{m.category ? ` · ${m.category}` : ''}</span>
            {canManage && <button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer ?', message: m.name, destructive: true })) delM.mutate(m.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        {models.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">{q ? 'Aucun résultat.' : ''}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
