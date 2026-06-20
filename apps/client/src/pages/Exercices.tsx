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
  ShoppingCart,
  TrendingUp,
  Package,
  Boxes,
  Percent,
  Coins,
  Copy,
  FileDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  moduleConfigBool,
  EMPLOYEE_POSITIONS,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from '@rp-compta/shared';
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
import { getSale, deleteSale } from '@/lib/sales';
import { buildInvoiceSvg, downloadSvgAsPng } from '@/lib/pngDoc';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);
const PAY_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.key, p.label]),
);

const PALETTE = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'];
const AXIS = 'rgba(148,163,184,0.6)';
const GRID = 'rgba(148,163,184,0.15)';
const chartTooltip = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
};

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
}
function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
function dayShort(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
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
    <div className="space-y-5">
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
                <ExerciceDetailView
                  companyId={companyId}
                  companyName={company?.company.name ?? 'Entreprise'}
                  id={ex.id}
                  showDividends={showDividends}
                />
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
  indent,
}: {
  label: string;
  value: string;
  accent?: string;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className={`${indent ? 'pl-3 ' : ''}${strong ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
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

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ?? 'text-muted-foreground'}`} />
      </div>
      <div className={`mt-2 text-lg font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function SaleRow({
  companyId,
  companyName,
  sale,
  canCancel,
  onCancel,
}: {
  companyId: number;
  companyName: string;
  sale: import('@/lib/exercices').ExerciceSaleRow;
  canCancel: boolean;
  onCancel: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const det = useQuery({
    queryKey: ['sale-detail', companyId, sale.id],
    queryFn: () => getSale(companyId, sale.id),
    enabled: open,
  });
  const invoice = async () => {
    const sdet = det.data ?? (await getSale(companyId, sale.id));
    downloadSvgAsPng(
      buildInvoiceSvg({
        companyName,
        saleId: sdet.id,
        date: fmtDateTime(sdet.createdAt),
        clientName: sdet.clientName ?? 'Comptant',
        sellerName: sdet.employeeName ?? '—',
        paymentLabel: PAY_LABEL[sdet.paymentMethod] ?? sdet.paymentMethod,
        lines: sdet.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
        subtotal: sdet.subtotal,
        discount: sdet.discount,
        total: sdet.total,
      }),
      `facture-${sdet.id}.png`,
    );
  };
  return (
    <>
      <tr className="border-t">
        <td className="px-2 py-1.5">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
        </td>
        <td className="px-2 py-1.5">#{sale.id}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">{fmtDateTime(sale.createdAt)}</td>
        <td className="px-2 py-1.5">{sale.employeeName ?? '—'}</td>
        <td className="px-2 py-1.5">{sale.clientName ?? '—'}</td>
        <td className="px-2 py-1.5 text-right">{fmtMoney(sale.subtotal)} $</td>
        <td className="px-2 py-1.5 text-right font-medium">{fmtMoney(sale.total)} $</td>
        <td className="px-2 py-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{PAY_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</span>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={invoice} title="Facture (PNG)" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <FileDown className="h-4 w-4" />
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Annuler la vente #${sale.id} ? (stock et client recrédités)`)) onCancel(sale.id);
                }}
                title="Annuler"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-t bg-background/30">
          <td colSpan={9} className="px-6 py-2">
            {det.isLoading ? (
              <span className="text-xs text-muted-foreground">Chargement…</span>
            ) : (
              <div className="space-y-1">
                {(det.data?.lines ?? []).map((l) => (
                  <div key={l.id} className="flex justify-between text-xs">
                    <span>{l.name} × {l.quantity.toLocaleString('fr-FR')}</span>
                    <span className="text-muted-foreground">{fmtMoney(l.lineTotal)} $</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ExerciceDetailView({
  companyId,
  companyName,
  id,
  showDividends,
}: {
  companyId: number;
  companyName: string;
  id: number;
  showDividends: boolean;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['exercice', companyId, id],
    queryFn: () => getExercice(companyId, id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['exercice', companyId, id] });
  const savePay = useMutation({
    mutationFn: (v: { employeeId: number; body: { commission: number; bonus: number; deductions: number } }) =>
      setExercicePayroll(companyId, id, v.employeeId, v.body),
    onSuccess: refresh,
    onError: () => {
      alert("Échec de l'enregistrement de la paie.");
      refresh();
    },
  });
  const saveDiv = useMutation({
    mutationFn: (v: number) => updateExercice(companyId, id, { dividends: v }),
    onSuccess: refresh,
  });
  const saveNotes = useMutation({
    mutationFn: (v: string) => updateExercice(companyId, id, { notes: v }),
    onSuccess: refresh,
  });
  const cancelSale = useMutation({
    mutationFn: (sid: number) => deleteSale(companyId, sid),
    onSuccess: () => {
      refresh();
      for (const k of ['sales', 'stocks', 'clients']) queryClient.invalidateQueries({ queryKey: [k, companyId] });
    },
    onError: () => alert("Échec de l'annulation."),
  });

  const [div, setDiv] = useState('');
  const [notes, setNotes] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [payFilter, setPayFilter] = useState('');
  useEffect(() => {
    if (!q.data) return;
    setDiv(q.data.dividends ? String(q.data.dividends) : '');
    setNotes(q.data.notes ?? '');
  }, [q.data?.id]);

  if (q.isLoading) return <div className="text-xs text-muted-foreground">Chargement…</div>;
  if (!q.data) return <div className="text-xs text-muted-foreground">Indisponible.</div>;
  const { summary: s, payroll, payrollVisible, canEdit, salesByDay, salesByPayment, perfByEmployee, topProducts, salesList } = q.data;

  const totalCa = perfByEmployee.reduce((a, p) => a + p.ca, 0);
  const payData = salesByPayment.map((p) => ({ name: PAY_LABEL[p.method] ?? p.method, value: p.total }));
  const filteredSales = salesList.filter(
    (sl) =>
      (!payFilter || sl.paymentMethod === payFilter) &&
      (!saleSearch.trim() ||
        `${sl.id} ${sl.employeeName ?? ''} ${sl.clientName ?? ''}`.toLowerCase().includes(saleSearch.trim().toLowerCase())),
  );

  const copyDeclaration = () => {
    const t = [
      `Déclaration — ${q.data!.label}`,
      `CA brut: ${fmtMoney(s.caGross)} $`,
      `Remises: ${fmtMoney(s.salesDiscount)} $`,
      `CA net: ${fmtMoney(s.caNet)} $`,
      `Charges: ${fmtMoney(s.charges)} $ (salaires ${fmtMoney(s.payrollTotal)} + dépenses ${fmtMoney(s.expensesTotal)})`,
      `Bénéfice: ${fmtMoney(s.benefit)} $`,
      `Base imposable: ${fmtMoney(s.taxableBenefit)} $`,
      `Impôt société: ${fmtMoney(s.corporateTax)} $`,
      `Dividendes: ${fmtMoney(s.dividends)} $ · impôt ${fmtMoney(s.dividendTax)} $`,
      `Résultat net après impôts: ${fmtMoney(s.netAfterTax)} $`,
    ].join('\n');
    navigator.clipboard?.writeText(t).then(() => alert('Déclaration copiée.'));
  };
  const copyPayroll = () => {
    const t = [`Paies — ${q.data!.label}`, ...payroll.map((p) => `${p.name}: ${fmtMoney(p.paid)} $`), `Total: ${fmtMoney(s.payrollTotal)} $`].join('\n');
    navigator.clipboard?.writeText(t).then(() => alert('Paies copiées.'));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi icon={ShoppingCart} label="Chiffre d'affaires" value={`${fmtMoney(s.caNet)} $`} accent="text-primary" />
        <Kpi icon={ShoppingCart} label="Nombre de ventes" value={`${s.salesCount}`} />
        <Kpi icon={TrendingUp} label="Marge brute" value={`${fmtMoney(s.grossMargin)} $`} accent="text-sky-400" />
        <Kpi icon={Package} label="Coût production" value={`${fmtMoney(s.productionCost)} $`} accent="text-amber-400" />
        <Kpi icon={Boxes} label="Achats composants" value={`${fmtMoney(s.componentPurchases)} $`} accent="text-destructive" />
        <Kpi icon={Percent} label="Remises accordées" value={`${fmtMoney(s.salesDiscount)} $`} accent="text-violet-400" />
        <Kpi icon={Coins} label="Bénéfice net" value={`${fmtMoney(s.benefit)} $`} accent="text-emerald-400" />
        <Kpi icon={Coins} label="Résultat après impôts" value={`${fmtMoney(s.netAfterTax)} $`} accent={s.netAfterTax >= 0 ? 'text-emerald-400' : 'text-destructive'} />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Déclaration fiscale</h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyPayroll}><Copy className="h-3.5 w-3.5" />Copier paies</Button>
            <Button variant="outline" onClick={copyDeclaration}><Copy className="h-3.5 w-3.5" />Copier déclaration</Button>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">État comptable</div>
            <Row label="CA Brut (avant remises)" value={`${fmtMoney(s.caGross)} $`} />
            <Row label="Remises accordées" value={`− ${fmtMoney(s.salesDiscount)} $`} accent="text-violet-400" indent />
            <Row label="CA Net" value={`${fmtMoney(s.caNet)} $`} strong accent="text-emerald-400" />
            <Row label="Salaires versés" value={`− ${fmtMoney(s.payrollTotal)} $`} accent="text-destructive" indent />
            <Row label="Dépenses autres" value={`− ${fmtMoney(s.expensesTotal)} $`} accent="text-destructive" indent />
            <Row label="Total charges" value={`− ${fmtMoney(s.charges)} $`} strong accent="text-destructive" />
            <Row label="Réduction fiscale (dépenses déductibles)" value={`${fmtMoney(s.expensesDeductible)} $`} accent="text-sky-400" />
            <div className="my-1 border-t" />
            <Row label="Bénéfice (CA Net − Charges)" value={`${fmtMoney(s.benefit)} $`} strong accent={s.benefit >= 0 ? 'text-emerald-400' : 'text-destructive'} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fiscalité</div>
            <Row label="Base imposable" value={`${fmtMoney(s.taxableBenefit)} $`} />
            <Row label={`Impôt sur les bénéfices${s.effectiveRate > 0 ? ` (~${s.effectiveRate}%)` : ''}`} value={`− ${fmtMoney(s.corporateTax)} $`} accent="text-destructive" />
            {showDividends && (
              <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="text-muted-foreground">Dividendes versés</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canEdit}
                    className="h-8 w-28 rounded-md border border-input bg-background px-2 text-right text-sm outline-none focus:ring-1 focus:ring-ring"
                    value={div}
                    onChange={(e) => setDiv(e.target.value)}
                  />
                  {canEdit && (
                    <Button variant="outline" onClick={() => saveDiv.mutate(Number(div) || 0)} disabled={saveDiv.isPending}>
                      OK
                    </Button>
                  )}
                </div>
              </div>
            )}
            {showDividends && (
              <Row label={`Impôt sur les dividendes (${s.dividendTaxRate}%)`} value={`− ${fmtMoney(s.dividendTax)} $`} accent="text-destructive" />
            )}
            <div className="my-1 border-t" />
            <Row label="Résultat net après impôts" value={`${fmtMoney(s.netAfterTax)} $`} strong accent={s.netAfterTax >= 0 ? 'text-emerald-400' : 'text-destructive'} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Ventes par jour</h3>
          {s.caNet === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-muted-foreground">Aucune vente.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayShort} tick={{ fontSize: 10, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} width={48} />
                <Tooltip contentStyle={chartTooltip} labelFormatter={dayShort} formatter={(v) => [`${fmtMoney(v as number)} $`, 'CA']} cursor={{ fill: GRID }} />
                <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Par moyen de paiement</h3>
          {payData.length === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-muted-foreground">Aucune vente.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={payData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {payData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltip} formatter={(v, n) => [`${fmtMoney(v as number)} $`, n as string]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {payData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-medium">{fmtMoney(d.value)} $</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Performance employés</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-semibold">Employé</th>
                <th className="px-2 py-1.5 text-right font-semibold">Ventes</th>
                <th className="px-2 py-1.5 text-right font-semibold">CA généré</th>
                <th className="px-2 py-1.5 text-right font-semibold">Remises données</th>
                <th className="px-2 py-1.5 text-right font-semibold">% du CA</th>
              </tr>
            </thead>
            <tbody>
              {perfByEmployee.map((p, i) => (
                <tr key={p.employeeId} className={i > 0 ? 'border-t' : ''}>
                  <td className="px-2 py-1.5">{p.name}</td>
                  <td className="px-2 py-1.5 text-right">{p.salesCount}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-emerald-400">{fmtMoney(p.ca)} $</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtMoney(p.discounts)} $</td>
                  <td className="px-2 py-1.5 text-right">{totalCa > 0 ? Math.round((p.ca / totalCa) * 1000) / 10 : 0}%</td>
                </tr>
              ))}
              {perfByEmployee.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-3 text-center text-xs text-muted-foreground">Aucun employé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Top produits de la semaine</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-semibold">Produit</th>
                <th className="px-2 py-1.5 text-right font-semibold">Qté vendue</th>
                <th className="px-2 py-1.5 text-right font-semibold">CA</th>
                <th className="px-2 py-1.5 text-right font-semibold">Coût</th>
                <th className="px-2 py-1.5 text-right font-semibold">Marge</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.name + i} className={i > 0 ? 'border-t' : ''}>
                  <td className="px-2 py-1.5">{p.name}</td>
                  <td className="px-2 py-1.5 text-right">{p.qty.toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-400">{fmtMoney(p.ca)} $</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtMoney(p.cost)} $</td>
                  <td className="px-2 py-1.5 text-right font-medium">{fmtMoney(p.margin)} $</td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-3 text-center text-xs text-muted-foreground">Aucune vente.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Paies employés — {fmtMoney(s.payrollTotal)} $ versés</h3>
          {q.data.hoursCap > 0 || q.data.salaryCap > 0 ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Plafonds {q.data.salaryCap > 0 ? `${fmtMoney(q.data.salaryCap)} $` : '∞'} / {q.data.hoursCap > 0 ? `${q.data.hoursCap}h` : '∞'}
            </span>
          ) : null}
        </div>
        {!payrollVisible ? (
          <div className="text-xs text-muted-foreground">Le détail par employé nécessite l'accès « Badgeuse ». Total inclus dans les charges.</div>
        ) : payroll.length === 0 ? (
          <div className="text-xs text-muted-foreground">Aucune heure pointée sur la période.</div>
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
                  <th className="px-2 py-1.5 text-right font-semibold">Total paie</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p) => (
                  <PayrollRow key={p.employeeId} p={p} editable={canEdit} onSave={(employeeId, body) => savePay.mutate({ employeeId, body })} />
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="px-2 py-2">TOTAL</td>
                  <td className="px-2 py-2 text-right text-sky-400">{Math.round(payroll.reduce((a, p) => a + p.hours, 0) * 60)}min</td>
                  <td className="px-2 py-2 text-right">{fmtMoney(payroll.reduce((a, p) => a + p.base, 0))} $</td>
                  <td className="px-2 py-2 text-right">{fmtMoney(payroll.reduce((a, p) => a + p.commission, 0))} $</td>
                  <td className="px-2 py-2 text-right">{fmtMoney(payroll.reduce((a, p) => a + p.bonus, 0))} $</td>
                  <td className="px-2 py-2 text-right text-destructive">{fmtMoney(payroll.reduce((a, p) => a + p.deductions, 0))} $</td>
                  <td className="px-2 py-2 text-right">{fmtMoney(s.payrollTotal)} $</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Détail des ventes ({salesList.length})</h3>
          <div className="flex gap-2">
            <input
              value={saleSearch}
              onChange={(e) => setSaleSearch(e.target.value)}
              placeholder="Rechercher #, employé, client"
              className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none">
              <option value="">Tous paiements</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
        {filteredSales.length === 0 ? (
          <div className="text-xs text-muted-foreground">Aucune vente.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8" />
                  <th className="px-2 py-1.5 text-left font-semibold">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Employé</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Client</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Sous-total</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Paiement</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sl) => (
                  <SaleRow
                    key={sl.id}
                    companyId={companyId}
                    companyName={companyName}
                    sale={sl}
                    canCancel={canEdit}
                    onCancel={(sid) => cancelSale.mutate(sid)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Notes de l'exercice</h3>
        <textarea
          className="h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!canEdit}
          placeholder="Notes internes, observations, points à déclarer…"
        />
        {canEdit && (
          <div className="mt-2">
            <Button onClick={() => saveNotes.mutate(notes)} disabled={saveNotes.isPending}>
              {saveNotes.isPending ? 'Sauvegarde…' : 'Sauvegarder les notes'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
