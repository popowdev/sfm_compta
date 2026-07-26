import { useState } from 'react';
import { useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Phone,
  CalendarDays,
  AlertTriangle,
  ChevronDown,
  Link2,
  UserPlus,
  Coins,
  FileDown,
  Users,
  UserCheck,
} from 'lucide-react';
import { CONTRACT_TYPES, moduleConfigBool, type ContractType } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { fmtInt } from '@/lib/declarations';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  type Employee,
  type EmployeeInput,
  type CompanyMemberRef,
} from '@/lib/employees';
import { getSalaryGrid } from '@/lib/salary';
import { SalaryGridModal } from '@/components/SalaryGridModal';
import { buildContractSvg, downloadSvgAsPng } from '@/lib/pngDoc';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const CONTRACT_LABEL: Record<string, string> = Object.fromEntries(
  CONTRACT_TYPES.map((c) => [c.key, c.label]),
);

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
}

const EMPTY = {
  name: '',
  companyRoleId: null as number | null,
  contractType: 'cdi' as ContractType,
  contractSigned: false,
  phone: '',
  iban: '',
  dateOfBirth: '',
  hireDate: '',
  hourlyRate: '',
  commissionRate: '',
  warnings: '0',
  terminationReason: '',
  active: true,
  notes: '',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Soon({ module }: { module: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      —
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        {module}
      </span>
    </span>
  );
}

function seniority(hireDate: string | null): string {
  if (!hireDate) return '—';
  const start = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return '—';
  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  if (days < 0) return '—';
  if (days < 31) return `${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mois`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years} an${years > 1 ? 's' : ''} ${rem} mois` : `${years} an${years > 1 ? 's' : ''}`;
}

export default function Employes() {
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('rh');
  const rhCfg = company?.modules.find((m) => m.key === 'rh')?.config;
  const showCommission = moduleConfigBool(rhCfg, 'rh', 'commission');
  const showWarnings = moduleConfigBool(rhCfg, 'rh', 'warnings');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const q = useQuery({ queryKey: ['employees', companyId], queryFn: () => getEmployees(companyId) });
  const grid = useQuery({ queryKey: ['salary-grid', companyId], queryFn: () => getSalaryGrid(companyId) });
  const gridRate = (roleId: number | null) =>
    grid.data?.grid.find((g) => g.companyRoleId === roleId)?.hourlyRate ?? 0;

  const downloadContract = (e: Employee) => {
    const svg = buildContractSvg({
      companyName: company?.company.name ?? 'Entreprise',
      employeeName: e.name,
      positionLabel: e.gradeName ?? '—',
      contractLabel: CONTRACT_LABEL[e.contractType] ?? e.contractType,
      hireDate: fmtDate(e.hireDate),
      dateOfBirth: fmtDate(e.dateOfBirth),
      hourlyRate: e.hourlyRate,
      commissionRate: e.commissionRate,
      today: new Date().toLocaleDateString('fr-FR'),
    });
    const slug = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    downloadSvgAsPng(svg, `contrat-${slug || e.id}.png`);
  };

  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<number | null>(null);
  const [linkUserId, setLinkUserId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const toggleExpand = (eid: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(eid)) n.delete(eid);
      else n.add(eid);
      return n;
    });

  const close = () => {
    setOpen(false);
    setEditing(null);
    setLinkUserId(null);
    setForm({ ...EMPTY });
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['employees', companyId] });
    close();
  };

  const saveErrorMsg = (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : null;
    switch (code) {
      case 'already_linked':
        return 'Ce membre a déjà une fiche RH.';
      case 'not_a_member':
        return "Ce joueur n'est pas membre de l'entreprise.";
      case 'invalid_grade':
        return 'Grade invalide.';
      case 'bad_request':
        return 'Champs invalides, vérifie le formulaire.';
      case 'not_found':
        return 'Employé introuvable.';
      default:
        return "Échec de l'enregistrement.";
    }
  };

  const create = useMutation({
    mutationFn: (body: EmployeeInput) => createEmployee(companyId, body),
    onSuccess: invalidate,
    onError: (e) => toast(saveErrorMsg(e), 'error'),
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: EmployeeInput }) => updateEmployee(companyId, v.id, v.body),
    onSuccess: invalidate,
    onError: (e) => toast(saveErrorMsg(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (eid: number) => deleteEmployee(companyId, eid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees', companyId] }),
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      toast(code === 'not_found' ? 'Employé introuvable.' : 'Échec de la suppression.', 'error');
    },
  });

  const defaultRate = () => {
    const r = gridRate(EMPTY.companyRoleId);
    return r > 0 ? String(r) : '';
  };
  const openNew = () => {
    setEditing(null);
    setLinkUserId(null);
    setForm({ ...EMPTY, hourlyRate: defaultRate() });
    setOpen(true);
  };
  const openFromMember = (m: CompanyMemberRef) => {
    setEditing(null);
    setLinkUserId(m.userId);
    setForm({ ...EMPTY, name: m.name, hourlyRate: defaultRate() });
    setOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e.id);
    setLinkUserId(null);
    setForm({
      name: e.name,
      companyRoleId: e.companyRoleId,
      contractType: e.contractType,
      contractSigned: e.contractSigned,
      phone: e.phone ?? '',
      iban: e.iban ?? '',
      dateOfBirth: e.dateOfBirth ?? '',
      hireDate: e.hireDate ?? '',
      hourlyRate: String(e.hourlyRate),
      commissionRate: String(e.commissionRate),
      warnings: String(e.warnings),
      terminationReason: e.terminationReason ?? '',
      active: e.active,
      notes: e.notes ?? '',
    });
    setOpen(true);
  };

  const submit = () => {
    const body: EmployeeInput = {
      userId: linkUserId ?? undefined,
      name: form.name.trim(),
      companyRoleId: form.companyRoleId,
      contractType: form.contractType,
      contractSigned: form.contractSigned,
      phone: form.phone.trim() || undefined,
      iban: form.iban.trim() || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      hireDate: form.hireDate || undefined,
      hourlyRate: Number(form.hourlyRate) || 0,
      commissionRate: Number(form.commissionRate) || 0,
      warnings: Number(form.warnings) || 0,
      terminationReason: !form.active ? form.terminationReason.trim() || undefined : undefined,
      active: form.active,
      notes: form.notes.trim() || undefined,
    };
    if (editing !== null) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const list = q.data?.employees ?? [];
  const members = q.data?.members ?? [];
  const activeCount = list.filter((e) => e.active).length;
  const warnTotal = list.reduce((s, e) => s + e.warnings, 0);
  const pending = create.isPending || update.isPending;

  if (q.isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          <KpiSkeleton />
          {showWarnings && <KpiSkeleton />}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="grid place-items-center gap-3 py-12 text-sm text-muted-foreground">
        Impossible de charger les employés.
        <Button variant="outline" onClick={() => q.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(canCreate || canEdit) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => setGridOpen(true)}>
              <Coins className="h-4 w-4" />
              Grille salariale
            </Button>
          )}
          {canCreate && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Nouvel employé
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi icon={Users} label="Employés" value={String(list.length)} />
        <Kpi icon={UserCheck} label="Actifs" value={String(activeCount)} accent="text-primary" />
        {showWarnings && (
          <Kpi
            icon={AlertTriangle}
            label="Avertissements"
            value={String(warnTotal)}
            accent="text-amber-400"
          />
        )}
      </div>

      <SalaryGridModal companyId={companyId} open={gridOpen} onClose={() => setGridOpen(false)} />

      {members.length > 0 && (
        <div className="rounded-xl border border-dashed bg-card p-4">
          <div className="mb-3 text-sm font-semibold">
            Membres sans fiche RH{' '}
            <span className="text-muted-foreground">({members.length})</span>
          </div>
          <div className="space-y-2">
            {members.map((m: CompanyMemberRef) => (
              <div key={m.userId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.gradeName ?? 'membre'} · accès site, pas de fiche RH
                  </span>
                </div>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => openFromMember(m)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Créer la fiche
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {list.map((e) => {
          const isOpen = expanded.has(e.id);
          return (
            <div key={e.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => toggleExpand(e.id)}
                  aria-expanded={isOpen}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isOpen ? '' : '-rotate-90'
                      }`}
                    />
                    <span className="text-base font-semibold">{e.name}</span>
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                      {e.gradeName ?? 'membre'}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        e.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {e.active ? 'actif' : 'inactif'}
                    </span>
                    {e.userId && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-400">
                        <Link2 className="h-3 w-3" />
                        {e.gradeName ?? 'compte lié'}
                      </span>
                    )}
                    {showWarnings && e.warnings > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {e.warnings}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                    <span>
                      {CONTRACT_LABEL[e.contractType] ?? e.contractType} ·{' '}
                      {e.contractSigned ? 'signé' : 'non signé'}
                    </span>
                    {e.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {e.phone}
                      </span>
                    )}
                    {e.hireDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        embauché le {fmtDate(e.hireDate)}
                      </span>
                    )}
                  </div>
                </button>
                {(canEdit || canDelete) && (
                  <div className="flex shrink-0 gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
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
                              title: 'Supprimer ?',
                              message: `Supprimer ${e.name} ?`,
                              destructive: true,
                            })
                          )
                            remove.mutate(e.id);
                        }}
                        title="Supprimer"
                        className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Taux horaire" value={`${fmtInt(e.hourlyRate)} $/h`} />
                    {showCommission && (
                      <Field label="Commission" value={`${e.commissionRate.toFixed(0)} %`} />
                    )}
                    <Field label="Ancienneté" value={seniority(e.hireDate)} />
                    <Field label="Naissance" value={fmtDate(e.dateOfBirth)} />
                    <Field label="IBAN" value={e.iban || '—'} />
                  </div>

                  <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Performance
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Field label="Ventes faites" value={<Soon module="caisse" />} />
                      <Field label="CA généré" value={<Soon module="caisse" />} />
                      <Field label="Heures" value={<Soon module="badgeuse" />} />
                      <Field label="Salaire période" value={<Soon module="badgeuse" />} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Ventes & CA se rempliront avec le module Caisse ; les heures et le salaire avec
                      la Badgeuse.
                    </p>
                  </div>

                  {!e.active && e.terminationReason && (
                    <div className="mt-3 rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Licenciement : {e.terminationReason}
                    </div>
                  )}
                  {e.notes && <div className="mt-3 text-sm text-muted-foreground">{e.notes}</div>}
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" onClick={() => downloadContract(e)}>
                      <FileDown className="h-4 w-4" />
                      Contrat (PNG)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <EmptyState
            icon={Users}
            title="Aucun employé enregistré"
            action={
              canCreate ? (
                <Button variant="outline" onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Ajouter le premier employé
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editing ? "Modifier l'employé" : 'Nouvel employé'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.name.trim()) submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Nom / prénom</span>
                  <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Grade</span>
                  <select
                    className={inputCls}
                    value={form.companyRoleId ?? ''}
                    onChange={(e) => {
                      const roleId = e.target.value ? Number(e.target.value) : null;
                      if (editing === null) {
                        const cur = form.hourlyRate.trim();
                        const untouched = cur === '' || Number(cur) === gridRate(form.companyRoleId);
                        if (untouched) {
                          const r = gridRate(roleId);
                          set('hourlyRate', r > 0 ? String(r) : '');
                        }
                      }
                      set('companyRoleId', roleId);
                    }}
                  >
                    <option value="">— Aucun grade —</option>
                    {(grid.data?.grid ?? []).map((g) => (
                      <option key={g.companyRoleId} value={g.companyRoleId}>
                        {g.gradeName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Type de contrat</span>
                  <select
                    className={inputCls}
                    value={form.contractType}
                    onChange={(e) => set('contractType', e.target.value as ContractType)}
                  >
                    {CONTRACT_TYPES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Taux horaire ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputCls}
                    value={form.hourlyRate}
                    onChange={(e) => set('hourlyRate', e.target.value)}
                  />
                </label>
                {showCommission && (
                  <label className="text-sm">
                    <span className={labelCls}>Commission (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className={inputCls}
                      value={form.commissionRate}
                      onChange={(e) => set('commissionRate', e.target.value)}
                    />
                  </label>
                )}
                <label className="text-sm">
                  <span className={labelCls}>Téléphone</span>
                  <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>IBAN</span>
                  <input className={inputCls} value={form.iban} onChange={(e) => set('iban', e.target.value)} placeholder="FR76 …" />
                </label>
                {showWarnings && (
                  <label className="text-sm">
                    <span className={labelCls}>Avertissements</span>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      className={inputCls}
                      value={form.warnings}
                      onChange={(e) => set('warnings', e.target.value)}
                    />
                  </label>
                )}
                <label className="text-sm">
                  <span className={labelCls}>Date d'embauche</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.hireDate}
                    onChange={(e) => set('hireDate', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Date de naissance</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.dateOfBirth}
                    onChange={(e) => set('dateOfBirth', e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={form.contractSigned}
                    onChange={(e) => set('contractSigned', e.target.checked)}
                  />
                  <span>Contrat signé</span>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={form.active}
                    onChange={(e) => set('active', e.target.checked)}
                  />
                  <span>Actif</span>
                </label>
                {!form.active && (
                  <label className="text-sm sm:col-span-2">
                    <span className={labelCls}>Motif de licenciement</span>
                    <input
                      className={inputCls}
                      value={form.terminationReason}
                      onChange={(e) => set('terminationReason', e.target.value)}
                    />
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Notes</span>
                  <textarea
                    className={`${inputCls} h-16 py-2`}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!form.name.trim() || pending}>
                  {pending ? 'Enregistrement…' : editing ? 'Enregistrer' : "Ajouter l'employé"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
