import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Landmark, Coins, Receipt, FileText } from 'lucide-react';
import { useModulePerms } from '@/lib/useCompany';
import { computeCorporateTax } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getMyCompanies } from '@/lib/me';
import { getFiscalConfig } from '@/lib/fiscal';
import { mondayOf, addDays, frDay } from '@/lib/bizWeek';
import {
  getMyDeclarations,
  submitDeclaration,
  getDeclarationPrefill,
  fmtMoney,
  type Declaration,
} from '@/lib/declarations';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

const STATUS: Record<Declaration['status'], { label: string; cls: string }> = {
  submitted: { label: 'soumise', cls: 'bg-amber-500/10 text-amber-400' },
  paid: { label: 'payée', cls: 'bg-primary/10 text-primary' },
  cancelled: { label: 'annulée', cls: 'bg-destructive/10 text-destructive' },
};

const WEEK_CHOICES = Array.from({ length: 9 }, (_, i) => -i);

function weekChoiceLabel(offset: number): string {
  const monday = mondayOf(new Date(), offset);
  const range = `${frDay(monday)} → ${frDay(addDays(monday, 6))}`;
  if (offset === 0) return `Semaine en cours (${range})`;
  if (offset === -1) return `Semaine dernière (${range})`;
  return `Semaine du ${range}`;
}

const EMPTY = {
  offset: '',
  weekStart: '',
  weekLabel: '',
  source: '',
  nonDeductible: '',
  declarantName: '',
  caNet: '',
  charges: '',
  benefit: '',
  dividends: '',
  email: '',
  notes: '',
};

export default function Declarations() {
  const { companyId, canCreate } = useModulePerms('declarations');
  const queryClient = useQueryClient();
  const toast = useToast();

  const my = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });
  const decls = useQuery({
    queryKey: ['declarations', companyId],
    queryFn: () => getMyDeclarations(companyId),
    enabled: companyId > 0,
  });
  const fiscal = useQuery({ queryKey: ['fiscal'], queryFn: getFiscalConfig });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setOpen(false);
    setForm({ ...EMPTY });
  };

  const submit = useMutation({
    mutationFn: () =>
      submitDeclaration(companyId, {
        weekStart: form.weekStart,
        declarantName: form.declarantName.trim(),
        caNet: Number(form.caNet) || 0,
        charges: Number(form.charges) || 0,
        benefit: Math.round(((Number(form.caNet) || 0) - (Number(form.charges) || 0)) * 100) / 100,
        dividends: Number(form.dividends) || 0,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      close();
      queryClient.invalidateQueries({ queryKey: ['declarations', companyId] });
    },
    onError: (err) => {
      const code = err instanceof Error ? err.message : '';
      toast(
        code === 'week_exists'
          ? 'Une déclaration existe déjà pour cette semaine.'
          : code === 'bad_week'
            ? 'Semaine invalide.'
            : "Échec de l'envoi de la déclaration.",
        'error',
      );
    },
  });

  const prefill = useMutation({
    mutationFn: (offset: number) => getDeclarationPrefill(companyId, offset),
    onSuccess: (d, offset) => {
      setForm((f) => ({
        ...f,
        offset: String(offset),
        weekStart: d.weekStart,
        weekLabel: d.weekLabel,
        source: d.source,
        nonDeductible: String(d.nonDeductible),
        caNet: String(d.caNet),
        charges: String(d.charges),
        benefit: String(d.benefit),
        dividends: String(d.dividends),
      }));
    },
    onError: () => toast('Échec du préremplissage.', 'error'),
  });

  const company = my.data?.find((c) => c.company.id === companyId);
  if (!my.isLoading && !company) return <Navigate to="/" replace />;

  const benefit = Math.round(((Number(form.caNet) || 0) - (Number(form.charges) || 0)) * 100) / 100;
  const dividends = Number(form.dividends) || 0;
  const nonDeductible = Number(form.nonDeductible) || 0;
  const taxable = Math.round(Math.max(0, benefit + nonDeductible) * 100) / 100;
  const corpTax = computeCorporateTax(taxable, fiscal.data?.brackets ?? []);
  const divRate = fiscal.data?.dividendTaxRate ?? 0;
  const divTax = Math.round(((dividends * divRate) / 100) * 100) / 100;
  const total = Math.round((corpTax + divTax) * 100) / 100;

  const list = decls.data?.declarations ?? [];
  const sumCorpTax = list.reduce((s, d) => s + d.corporateTax, 0);
  const sumDivTax = list.reduce((s, d) => s + d.dividendTax, 0);
  const sumTotalTax = list.reduce((s, d) => s + d.totalTax, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={Landmark} label="Impôt société (barème)" value={`${fmtMoney(sumCorpTax)} $`} accent="text-sky-400" />
          <Kpi icon={Coins} label={`Impôt dividendes (${divRate}%)`} value={`${fmtMoney(sumDivTax)} $`} accent="text-amber-400" />
          <Kpi icon={Receipt} label="Total impôt" value={`${fmtMoney(sumTotalTax)} $`} accent="text-primary" />
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle déclaration
          </Button>
        )}
      </div>

      {decls.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : decls.isError ? (
        <div className="grid place-items-center gap-3 rounded-xl border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">Impossible de charger les déclarations.</p>
          <Button variant="outline" onClick={() => decls.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune déclaration pour l'instant."
          hint="Crée ta première déclaration hebdomadaire pour la voir apparaître ici."
          action={
            canCreate ? (
              <Button variant="outline" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Nouvelle déclaration
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Semaine</th>
                  <th className="px-4 py-3 text-right font-semibold">CA NET</th>
                  <th className="px-4 py-3 text-right font-semibold">Bénéfice</th>
                  <th className="px-4 py-3 text-right font-semibold">Total impôt</th>
                  <th className="px-4 py-3 text-right font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{d.weekLabel}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(d.caNet)} $</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(d.benefit)} $</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(d.totalTax)} $</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[d.status].cls}`}>
                        {STATUS[d.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouvelle déclaration</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.weekStart && form.declarantName.trim() && !prefill.isPending) submit.mutate();
              }}
            >
              <p className="mb-4 text-xs text-muted-foreground">
                Choisis la semaine : le CA (tous modules), les charges (dépenses, salaires, coûts de
                production) et les dividendes sont repris de l'exercice de la semaine s'il existe,
                sinon calculés. Vérifie, ajuste si besoin, puis envoie.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Semaine déclarée</span>
                  <select
                    className={inputCls}
                    value={form.offset}
                    disabled={prefill.isPending}
                    onChange={(e) => {
                      if (e.target.value !== '') prefill.mutate(Number(e.target.value));
                    }}
                  >
                    <option value="" disabled>
                      Choisir une semaine…
                    </option>
                    {WEEK_CHOICES.map((o) => (
                      <option key={o} value={String(o)}>
                        {weekChoiceLabel(o)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {prefill.isPending
                      ? 'Calcul…'
                      : form.source === 'exercice'
                        ? "Chiffres repris de l'exercice de la semaine."
                        : form.source === 'live'
                          ? "Pas d'exercice pour cette semaine : chiffres calculés."
                          : ''}
                  </span>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Déclarant (nom/prénom)</span>
                  <input
                    className={inputCls}
                    value={form.declarantName}
                    onChange={(e) => set('declarantName', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">CA NET ($)</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.caNet}
                    onChange={(e) => set('caNet', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Charges ($)</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.charges}
                    onChange={(e) => set('charges', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Bénéfice ($)</span>
                  <input
                    type="number"
                    className={`${inputCls} bg-muted/50`}
                    value={String(Math.round(((Number(form.caNet) || 0) - (Number(form.charges) || 0)) * 100) / 100)}
                    readOnly
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">Calculé : CA net − charges.</span>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Dividendes reversés ($)</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.dividends}
                    onChange={(e) => set('dividends', e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Email entreprise</span>
                  <input
                    className={inputCls}
                    placeholder="entreprise@lossantos.us"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Informations / remarques</span>
                  <textarea
                    className={`${inputCls} h-20 py-2`}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </label>
              </div>

              {nonDeductible > 0 && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Base imposable : {fmtMoney(taxable)} $ (bénéfice + {fmtMoney(nonDeductible)} $ de
                  dépenses non déductibles).
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-background p-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Impôt société (barème)</div>
                  <div className="text-lg font-semibold">{fmtMoney(corpTax)} $</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Impôt dividendes ({divRate}%)</div>
                  <div className="text-lg font-semibold">{fmtMoney(divTax)} $</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total impôt</div>
                  <div className="text-lg font-semibold text-primary">{fmtMoney(total)} $</div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={!form.weekStart || !form.declarantName.trim() || submit.isPending || prefill.isPending}
                >
                  {submit.isPending ? 'Envoi…' : 'Soumettre la déclaration'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
