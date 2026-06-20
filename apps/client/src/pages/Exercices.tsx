import { useState } from 'react';
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
import { moduleConfigBool, EMPLOYEE_POSITIONS } from '@rp-compta/shared';
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
  type Exercice,
  type ExerciceInput,
} from '@/lib/exercices';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
}

const EMPTY = { label: '', startDate: '', endDate: '', revenue: '', dividends: '', notes: '' };

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
    const dividendsField = showDividends ? { dividends: Number(form.dividends) || 0 } : {};
    if (editing !== null) {
      update.mutate({
        id: editing,
        body: {
          label: form.label.trim(),
          revenue: Number(form.revenue) || 0,
          ...dividendsField,
          notes: form.notes.trim() || undefined,
        },
      });
    } else {
      create.mutate({
        label: form.label.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        revenue: Number(form.revenue) || 0,
        ...dividendsField,
        notes: form.notes.trim() || undefined,
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
                module Caisse. Dépenses et salaires sont agrégés depuis la période.
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

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${accent ?? ''}`}>{value}</span>
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
  const q = useQuery({
    queryKey: ['exercice', companyId, id],
    queryFn: () => getExercice(companyId, id),
  });
  if (q.isLoading) return <div className="text-xs text-muted-foreground">Chargement…</div>;
  if (!q.data) return <div className="text-xs text-muted-foreground">Indisponible.</div>;
  const { summary: s, payroll, payrollVisible } = q.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-background/40 p-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Compte de résultat
        </div>
        <Row label="Chiffre d'affaires" value={`${fmtMoney(s.revenue)} $`} accent="text-primary" />
        <div className="my-1 border-t" />
        <Row label="Dépenses" value={`− ${fmtMoney(s.expensesTotal)} $`} />
        <Row label="Salaires (badgeuse)" value={`− ${fmtMoney(s.payrollTotal)} $`} />
        <Row label="Total des charges" value={`− ${fmtMoney(s.charges)} $`} />
        <div className="my-1 border-t" />
        <Row
          label="Bénéfice avant impôt"
          value={`${fmtMoney(s.benefit)} $`}
          accent={s.benefit >= 0 ? 'text-emerald-400' : 'text-destructive'}
        />
        <Row label="Impôt société (barème)" value={`− ${fmtMoney(s.corporateTax)} $`} />
        {showDividends && (
          <>
            <Row label="Dividendes distribués" value={`− ${fmtMoney(s.dividends)} $`} />
            <Row
              label={`Impôt dividendes (${s.dividendTaxRate}%)`}
              value={`− ${fmtMoney(s.dividendTax)} $`}
            />
          </>
        )}
        <div className="my-1 border-t" />
        <Row
          label="Résultat net"
          value={`${fmtMoney(s.netAfterTax)} $`}
          accent={s.netAfterTax >= 0 ? 'text-emerald-400' : 'text-destructive'}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Les salaires proviennent de la badgeuse ; les dépenses de catégorie « Salaires » sont
          exclues pour éviter le double comptage. Le CA détaillé arrivera avec le module Caisse.
        </p>
      </div>

      <div className="rounded-lg border bg-background/40 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Paie de la période ({fmtMoney(s.payrollTotal)} $)
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
                  <th className="px-2 py-1.5 text-right font-semibold">Taux</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Salaire</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p, i) => (
                  <tr key={p.employeeId} className={i > 0 ? 'border-t' : ''}>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {POSITION_LABEL[p.position] ?? p.position}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">{p.hours.toLocaleString('fr-FR')} h</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {fmtMoney(p.hourlyRate)} $/h
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">{fmtMoney(p.salary)} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s.expensesDeductible > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Dépenses fiscalement déductibles sur la période : {fmtMoney(s.expensesDeductible)} $.
          </p>
        )}
      </div>
    </div>
  );
}
