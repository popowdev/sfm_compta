import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  CalendarPlus,
  Lock,
  LockOpen,
} from 'lucide-react';
import { moduleConfigBool, EMPLOYEE_POSITIONS, EXPENSE_CATEGORIES } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/declarations';
import { ApiError } from '@/lib/api';
import { useModulePerms } from '@/lib/useCompany';
import {
  getExercices,
  getExercice,
  createExercice,
  generateWeek,
  updateExercice,
  deleteExercice,
  setExercicePayroll,
  type Exercice,
  type ExerciceInput,
  type PayrollLine,
} from '@/lib/exercices';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
}

const EMPTY = {
  label: '',
  startDate: '',
  endDate: '',
  revenue: '',
  dividends: '',
  hoursCap: '',
  salaryCap: '',
  notes: '',
};

export default function Exercices() {
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('exercices');
  const cfg = company?.modules.find((m) => m.key === 'exercices')?.config;
  const showDividends = moduleConfigBool(cfg, 'exercices', 'dividends');
  const queryClient = useQueryClient();

  const q = useQuery({ queryKey: ['exercices', companyId], queryFn: () => getExercices(companyId) });

  const [expanded, setExpanded] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['exercices', companyId] });

  const create = useMutation({
    mutationFn: (body: ExerciceInput) => createExercice(companyId, body),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
    onError: (e) =>
      alert(
        e instanceof ApiError && e.code === 'duplicate_period'
          ? 'Un exercice existe déjà pour cette période.'
          : "Échec de la création de l'exercice.",
      ),
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof updateExercice>[2] }) =>
      updateExercice(companyId, v.id, v.body),
    onSuccess: (_d, v) => {
      setOpen(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['exercice', companyId, v.id] });
    },
  });
  const genWeek = useMutation({
    mutationFn: (offset: number) => generateWeek(companyId, offset),
    onSuccess: (d) => {
      invalidate();
      if (d.existing && d.id != null) {
        setExpanded(d.id);
        alert('La semaine en cours a déjà un exercice.');
      }
    },
    onError: () => alert('Échec de la génération de la semaine.'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteExercice(companyId, id),
    onSuccess: invalidate,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };
  const openEdit = (ex: Exercice) => {
    setEditing(ex.id);
    setForm({
      label: ex.label,
      startDate: ex.startDate,
      endDate: ex.endDate,
      revenue: String(ex.revenue),
      dividends: String(ex.dividends),
      hoursCap: ex.hoursCap ? String(ex.hoursCap) : '',
      salaryCap: ex.salaryCap ? String(ex.salaryCap) : '',
      notes: ex.notes ?? '',
    });
    setOpen(true);
  };

  const valid =
    form.label.trim().length > 0 &&
    form.startDate !== '' &&
    form.endDate !== '' &&
    form.endDate >= form.startDate;

  const submit = () => {
    const common = {
      revenue: Number(form.revenue) || 0,
      hoursCap: Number(form.hoursCap) || 0,
      salaryCap: Number(form.salaryCap) || 0,
      notes: form.notes.trim() || undefined,
      ...(showDividends ? { dividends: Number(form.dividends) || 0 } : {}),
    };
    if (editing !== null) {
      update.mutate({ id: editing, body: { label: form.label.trim(), ...common } });
    } else {
      create.mutate({
        label: form.label.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        ...common,
      });
    }
  };

  const list = q.data?.exercices ?? [];

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-lg border bg-card px-4 py-2">
          <span className="text-sm text-muted-foreground">Exercices </span>
          <span className="font-semibold">{list.length}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canCreate && (
            <>
              <Button variant="outline" onClick={() => genWeek.mutate(0)} disabled={genWeek.isPending}>
                <CalendarPlus className="h-4 w-4" />
                Semaine en cours
              </Button>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" />
                Nouvel exercice
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {list.map((ex) => (
          <div key={ex.id} className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <button
                type="button"
                onClick={() => setExpanded((c) => (c === ex.id ? null : ex.id))}
                aria-expanded={expanded === ex.id}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      expanded === ex.id ? '' : '-rotate-90'
                    }`}
                  />
                  <span className="text-base font-semibold">{ex.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                      ex.status === 'open'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {ex.status === 'open' ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {ex.status === 'open' ? 'ouvert' : 'clôturé'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                  <span>
                    {fmtDate(ex.startDate)} → {fmtDate(ex.endDate)}
                  </span>
                  <span>CA {fmtMoney(ex.revenue)} $</span>
                  {showDividends && ex.dividends > 0 && <span>dividendes {fmtMoney(ex.dividends)} $</span>}
                </div>
              </button>
              <div className="flex shrink-0 gap-1">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        update.mutate({
                          id: ex.id,
                          body: { status: ex.status === 'open' ? 'closed' : 'open' },
                        })
                      }
                      title={ex.status === 'open' ? 'Clôturer' : 'Rouvrir'}
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {ex.status === 'open' ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(ex)}
                      title="Modifier"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer l'exercice « ${ex.label} » ?`)) remove.mutate(ex.id);
                    }}
                    title="Supprimer"
                    className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {expanded === ex.id && (
              <div className="border-t px-4 pb-4 pt-3">
                <ExerciceDetailView companyId={companyId} id={ex.id} showDividends={showDividends} />
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Aucun exercice comptable.</p>
            {canCreate && (
              <Button variant="outline" onClick={() => genWeek.mutate(0)}>
                <CalendarPlus className="h-4 w-4" />
                Générer la semaine en cours
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
                {editing !== null ? "Modifier l'exercice" : 'Nouvel exercice'}
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
                  <span className={labelCls}>Libellé</span>
                  <input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Début {editing !== null && '(fixe)'}</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.startDate}
                    onChange={(e) => set('startDate', e.target.value)}
                    disabled={editing !== null}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Fin {editing !== null && '(fixe)'}</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.endDate}
                    onChange={(e) => set('endDate', e.target.value)}
                    disabled={editing !== null}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Chiffre d'affaires ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={form.revenue}
                    onChange={(e) => set('revenue', e.target.value)}
                    placeholder="0"
                  />
                </label>
                {showDividends && (
                  <label className="text-sm">
                    <span className={labelCls}>Dividendes distribués ($)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputCls}
                      value={form.dividends}
                      onChange={(e) => set('dividends', e.target.value)}
                      placeholder="0"
                    />
                  </label>
                )}
                <label className="text-sm">
                  <span className={labelCls}>Plafond d'heures / employé</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className={inputCls}
                    value={form.hoursCap}
                    onChange={(e) => set('hoursCap', e.target.value)}
                    placeholder="0 = illimité"
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Plafond de salaire / employé ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={form.salaryCap}
                    onChange={(e) => set('salaryCap', e.target.value)}
                    placeholder="0 = illimité"
                  />
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
                Le CA est saisi manuellement pour l'instant ; il se remplira automatiquement avec le
                module Caisse. Dépenses et salaires sont agrégés depuis la période. Les plafonds
                limitent les heures payées et le salaire par employé (le surplus reste à
                l'entreprise).
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
                      : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  strong,
}: {
  label: string;
  value: string;
  accent?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-medium ${accent ?? ''}`}>{value}</span>
    </div>
  );
}

const cellInput =
  'h-7 w-20 rounded border border-input bg-background px-1.5 text-right text-sm outline-none focus:ring-1 focus:ring-ring';

function PayrollRow({
  p,
  editable,
  onSave,
}: {
  p: PayrollLine;
  editable: boolean;
  onSave: (employeeId: number, body: { commission: number; bonus: number; deductions: number }) => void;
}) {
  const [commission, setCommission] = useState(p.commission ? String(p.commission) : '');
  const [bonus, setBonus] = useState(p.bonus ? String(p.bonus) : '');
  const [deductions, setDeductions] = useState(p.deductions ? String(p.deductions) : '');
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (focused !== 'commission') setCommission(p.commission ? String(p.commission) : '');
    if (focused !== 'bonus') setBonus(p.bonus ? String(p.bonus) : '');
    if (focused !== 'deductions') setDeductions(p.deductions ? String(p.deductions) : '');
  }, [p.commission, p.bonus, p.deductions, focused]);

  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const commit = () => {
    setFocused(null);
    const c = num(commission);
    const b = num(bonus);
    const d = num(deductions);
    if (c === p.commission && b === p.bonus && d === p.deductions) return;
    onSave(p.employeeId, { commission: c, bonus: b, deductions: d });
  };
  const capped = p.paid < p.theoretical;

  return (
    <tr className="border-t align-middle">
      <td className="px-2 py-1.5">
        <div className="font-medium">{p.name}</div>
        <div className="text-[11px] text-muted-foreground">{POSITION_LABEL[p.position] ?? p.position}</div>
      </td>
      <td className="px-2 py-1.5 text-right">
        {p.cappedHours.toLocaleString('fr-FR')} h
        {p.cappedHours < p.hours && (
          <div className="text-[10px] text-amber-400">/ {p.hours.toLocaleString('fr-FR')} h</div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtMoney(p.base)} $</td>
      <td className="px-2 py-1.5 text-right">
        {editable ? (
          <input
            type="number"
            step="0.01"
            min="0"
            className={cellInput}
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            onFocus={() => setFocused('commission')}
            onBlur={commit}
            placeholder="0"
          />
        ) : (
          `${fmtMoney(p.commission)} $`
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editable ? (
          <input
            type="number"
            step="0.01"
            min="0"
            className={cellInput}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            onFocus={() => setFocused('bonus')}
            onBlur={commit}
            placeholder="0"
          />
        ) : (
          `${fmtMoney(p.bonus)} $`
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editable ? (
          <input
            type="number"
            step="0.01"
            min="0"
            className={cellInput}
            value={deductions}
            onChange={(e) => setDeductions(e.target.value)}
            onFocus={() => setFocused('deductions')}
            onBlur={commit}
            placeholder="0"
          />
        ) : (
          `${fmtMoney(p.deductions)} $`
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-medium">
        {fmtMoney(p.paid)} $
        {capped && <div className="text-[10px] text-amber-400">plafonné</div>}
      </td>
    </tr>
  );
}

function SoonPanel({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-background/40 p-3">
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">À venir avec le module Caisse.</div>
    </div>
  );
}

function ExerciceDetailView({
  companyId,
  id,
  showDividends,
}: {
  companyId: number;
  id: number;
  showDividends: boolean;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['exercice', companyId, id],
    queryFn: () => getExercice(companyId, id),
  });
  const savePay = useMutation({
    mutationFn: (v: { employeeId: number; body: { commission: number; bonus: number; deductions: number } }) =>
      setExercicePayroll(companyId, id, v.employeeId, v.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercice', companyId, id] }),
    onError: () => {
      alert("Échec de l'enregistrement de la paie.");
      queryClient.invalidateQueries({ queryKey: ['exercice', companyId, id] });
    },
  });

  if (q.isLoading) return <div className="text-xs text-muted-foreground">Chargement…</div>;
  if (!q.data) return <div className="text-xs text-muted-foreground">Indisponible.</div>;
  const { summary: s, payroll, payrollVisible, expensesByCategory, canEdit } = q.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-background/40 p-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Compte de résultat
          </div>
          <Row label="Chiffre d'affaires" value={`${fmtMoney(s.revenue)} $`} accent="text-primary" strong />
          <div className="my-1 border-t" />
          <Row label="Dépenses" value={`− ${fmtMoney(s.expensesTotal)} $`} />
          <Row label="Salaires (badgeuse)" value={`− ${fmtMoney(s.payrollTotal)} $`} />
          {s.excessToCompany > 0 && (
            <div className="pl-3 text-[11px] text-muted-foreground">
              plafonné : {fmtMoney(s.excessToCompany)} $ non versés (gardés par l'entreprise)
            </div>
          )}
          <Row label="Total des charges" value={`− ${fmtMoney(s.charges)} $`} strong />
          <div className="my-1 border-t" />
          <Row
            label="Bénéfice avant impôt"
            value={`${fmtMoney(s.benefit)} $`}
            strong
            accent={s.benefit >= 0 ? 'text-emerald-400' : 'text-destructive'}
          />
          <Row label="Base imposable" value={`${fmtMoney(s.taxableBenefit)} $`} />
          <Row
            label={`Impôt société${s.effectiveRate > 0 ? ` (~${s.effectiveRate}%)` : ''}`}
            value={`− ${fmtMoney(s.corporateTax)} $`}
          />
          {showDividends && (
            <>
              <Row label="Dividendes distribués" value={`− ${fmtMoney(s.dividends)} $`} />
              <Row label={`Impôt dividendes (${s.dividendTaxRate}%)`} value={`− ${fmtMoney(s.dividendTax)} $`} />
            </>
          )}
          <div className="my-1 border-t" />
          <Row
            label="Résultat net"
            value={`${fmtMoney(s.netAfterTax)} $`}
            strong
            accent={s.netAfterTax >= 0 ? 'text-emerald-400' : 'text-destructive'}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Les salaires proviennent de la badgeuse ; les dépenses de catégorie « Salaires » sont
            exclues pour éviter le double comptage. Le CA détaillé arrivera avec le module Caisse.
          </p>
        </div>

        <div className="rounded-lg border bg-background/40 p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Dépenses par catégorie ({fmtMoney(s.expensesTotal)} $)
          </div>
          {expensesByCategory.length === 0 ? (
            <div className="text-xs text-muted-foreground">Aucune dépense sur la période.</div>
          ) : (
            <div className="space-y-1.5">
              {expensesByCategory.map((c) => {
                const pct = s.expensesTotal > 0 ? (c.total / s.expensesTotal) * 100 : 0;
                return (
                  <div key={c.category}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                      <span className="font-medium">{fmtMoney(c.total)} $</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {s.expensesDeductible > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Dont fiscalement déductible : {fmtMoney(s.expensesDeductible)} $.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-background/40 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Paie de la période — versée {fmtMoney(s.payrollTotal)} $
          </div>
          {canEdit && payrollVisible && payroll.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Commission / prime / retenue éditables (sauvegarde auto)
            </span>
          )}
        </div>
        {!payrollVisible ? (
          <div className="text-xs text-muted-foreground">
            Le détail par employé nécessite l'accès « Badgeuse ». Total inclus dans les charges.
          </div>
        ) : payroll.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Aucune heure pointée sur la période (badgeuse).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-semibold">Employé</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Heures</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Base</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Commission</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Prime</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Retenue</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Versé</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p) => (
                  <PayrollRow
                    key={p.employeeId}
                    p={p}
                    editable={canEdit}
                    onSave={(employeeId, body) => savePay.mutate({ employeeId, body })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-background/40 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ventes
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SoonPanel title="Ventes par jour" />
          <SoonPanel title="Ventes par employé" />
          <SoonPanel title="Top produits" />
          <SoonPanel title="Marge & coût de production" />
        </div>
      </div>
    </div>
  );
}
