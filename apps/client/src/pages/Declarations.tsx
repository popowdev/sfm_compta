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

const EMPTY = {
  weekLabel: '',
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
        weekLabel: form.weekLabel.trim(),
        declarantName: form.declarantName.trim(),
        caNet: Number(form.caNet) || 0,
        charges: Number(form.charges) || 0,
        benefit: Number(form.benefit) || 0,
        dividends: Number(form.dividends) || 0,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      close();
      queryClient.invalidateQueries({ queryKey: ['declarations', companyId] });
    },
  });

  const prefill = useMutation({
    mutationFn: (offset: number) => getDeclarationPrefill(companyId, offset),
    onSuccess: (d) => {
      setForm((f) => ({
        ...f,
        weekLabel: d.weekLabel,
        caNet: String(d.caNet),
        charges: String(d.charges),
        benefit: String(d.benefit),
      }));
    },
    onError: () => toast('Échec du préremplissage.', 'error'),
  });

  const company = my.data?.find((c) => c.company.id === companyId);
  if (!my.isLoading && !company) return <Navigate to="/" replace />;

  const benefit = Number(form.benefit) || 0;
  const dividends = Number(form.dividends) || 0;
  const corpTax = computeCorporateTax(benefit, fiscal.data?.brackets ?? []);
  const divRate = fiscal.data?.dividendTaxRate ?? 0;
  const divTax = Math.round(((dividends * divRate) / 100) * 100) / 100;
  const total = Math.round((corpTax + divTax) * 100) / 100;

  const list = decls.data?.declarations ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={Landmark} label="Impôt société (barème)" value={`${fmtMoney(corpTax)} $`} accent="text-sky-400" />
          <Kpi icon={Coins} label={`Impôt dividendes (${divRate}%)`} value={`${fmtMoney(divTax)} $`} accent="text-amber-400" />
          <Kpi icon={Receipt} label="Total impôt" value={`${fmtMoney(total)} $`} accent="text-primary" />
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close}>
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
                if (form.weekLabel.trim() && form.declarantName.trim()) submit.mutate();
              }}
            >
              <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => prefill.mutate(-1)} disabled={prefill.isPending}>
                  Pré-remplir (semaine dernière)
                </Button>
                <Button type="button" variant="outline" onClick={() => prefill.mutate(0)} disabled={prefill.isPending}>
                  {prefill.isPending ? 'Calcul…' : 'Pré-remplir (semaine en cours)'}
                </Button>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Le préremplissage calcule le CA (ventes Caisse), les charges (dépenses + salaires
                badgeuse) et le bénéfice de la semaine. Vérifie, ajuste si besoin, puis envoie.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Semaine déclarée</span>
                  <input
                    className={inputCls}
                    placeholder="ex. semaine 24 (16/06 → 22/06)"
                    value={form.weekLabel}
                    onChange={(e) => set('weekLabel', e.target.value)}
                  />
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
                    className={inputCls}
                    value={form.benefit}
                    onChange={(e) => set('benefit', e.target.value)}
                  />
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
                  disabled={!form.weekLabel.trim() || !form.declarantName.trim() || submit.isPending}
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
