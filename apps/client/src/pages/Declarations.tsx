import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useModulePerms } from '@/lib/useCompany';
import { computeCorporateTax } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { getMyCompanies } from '@/lib/me';
import { getFiscalConfig } from '@/lib/fiscal';
import {
  getMyDeclarations,
  submitDeclaration,
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

  const my = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });
  const decls = useQuery({
    queryKey: ['declarations', companyId],
    queryFn: () => getMyDeclarations(companyId),
  });
  const fiscal = useQuery({ queryKey: ['fiscal'], queryFn: getFiscalConfig });

  const [form, setForm] = useState({ ...EMPTY });
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      setForm({ ...EMPTY });
      queryClient.invalidateQueries({ queryKey: ['declarations', companyId] });
    },
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
    <div className="space-y-6">
      {canCreate && (
        <form
          className="rounded-xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.weekLabel.trim() && form.declarantName.trim()) submit.mutate();
          }}
        >
          <div className="mb-4 text-sm font-semibold">Nouvelle déclaration</div>
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

          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={!form.weekLabel.trim() || !form.declarantName.trim() || submit.isPending}
            >
              {submit.isPending ? 'Envoi…' : 'Soumettre la déclaration'}
            </Button>
          </div>
        </form>
      )}

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
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-muted-foreground">
                    Aucune déclaration pour l'instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
