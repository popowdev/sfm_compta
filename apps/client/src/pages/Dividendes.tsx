import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/declarations';
import { useModulePerms } from '@/lib/useCompany';
import {
  getDividends,
  createDividend,
  deleteDividend,
  type DividendInput,
} from '@/lib/dividends';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const EMPTY = { shareholderName: '', rib: '', gross: '', notes: '' };

export default function Dividendes() {
  const { companyId, canCreate, canDelete } = useModulePerms('dividendes');
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['dividends', companyId], queryFn: () => getDividends(companyId) });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const set = <K extends keyof typeof EMPTY>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dividends', companyId] });
  const create = useMutation({
    mutationFn: (body: DividendInput) => createDividend(companyId, body),
    onSuccess: () => {
      setOpen(false);
      setForm({ ...EMPTY });
      invalidate();
    },
    onError: () => alert('Échec de la déclaration (montant invalide ?).'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteDividend(companyId, id),
    onSuccess: invalidate,
  });

  const rate = q.data?.dividendTaxRate ?? 33;
  const payouts = q.data?.payouts ?? [];
  const totalGross = payouts.reduce((s, p) => s + p.gross, 0);
  const totalTax = payouts.reduce((s, p) => s + p.tax, 0);
  const totalNet = payouts.reduce((s, p) => s + p.net, 0);

  const grossNum = Number(form.gross);
  const valid =
    form.shareholderName.trim().length > 0 &&
    form.gross !== '' &&
    Number.isFinite(grossNum) &&
    grossNum >= 0 &&
    grossNum <= 999_999_999.99;
  const previewTax = Math.round(((Number(form.gross) || 0) * rate) / 100 * 100) / 100;
  const previewNet = Math.round(((Number(form.gross) || 0) - previewTax) * 100) / 100;
  const submit = () =>
    create.mutate({
      shareholderName: form.shareholderName.trim(),
      rib: form.rib.trim() || undefined,
      gross: grossNum,
      notes: form.notes.trim() || undefined,
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">Versements </span>
            <span className="font-semibold">{payouts.length}</span>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">Brut distribué </span>
            <span className="font-semibold text-primary">{fmtMoney(totalGross)} $</span>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">Impôt IRS </span>
            <span className="font-semibold text-amber-400">{fmtMoney(totalTax)} $</span>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">Net actionnaires </span>
            <span className="font-semibold text-emerald-400">{fmtMoney(totalNet)} $</span>
          </div>
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Déclarer un dividende
          </Button>
        )}
      </div>

      {payouts.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
          <Coins className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Aucun dividende déclaré.</p>
          {canCreate && (
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Déclarer le premier
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Actionnaire</th>
                <th className="px-3 py-2 text-left font-semibold">RIB</th>
                <th className="px-3 py-2 text-right font-semibold">Brut</th>
                <th className="px-3 py-2 text-right font-semibold">Impôt</th>
                <th className="px-3 py-2 text-right font-semibold">Net</th>
                <th className="px-3 py-2 text-left font-semibold">Réf.</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={p.id} className={i > 0 ? 'border-t' : ''}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                  <td className="px-3 py-2 font-medium">{p.shareholderName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.rib ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(p.gross)} $</td>
                  <td className="px-3 py-2 text-right text-amber-400">{fmtMoney(p.tax)} $</td>
                  <td className="px-3 py-2 text-right font-medium text-emerald-400">{fmtMoney(p.net)} $</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.reference}</td>
                  <td className="px-3 py-2 text-right">
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Supprimer ${p.reference} ?`)) remove.mutate(p.id);
                        }}
                        title="Supprimer"
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Déclarer un dividende</h2>
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
                <label className="text-sm">
                  <span className={labelCls}>Actionnaire</span>
                  <input className={inputCls} value={form.shareholderName} onChange={(e) => set('shareholderName', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>RIB</span>
                  <input className={inputCls} value={form.rib} onChange={(e) => set('rib', e.target.value)} placeholder="Optionnel" />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Montant brut ($)</span>
                  <input type="number" step="0.01" min="0" className={inputCls} value={form.gross} onChange={(e) => set('gross', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Notes</span>
                  <input className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optionnel" />
                </label>
              </div>
              <div className="mt-4 rounded-lg border bg-background/40 p-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Impôt IRS ({rate}%)</span>
                  <span className="text-amber-400">− {fmtMoney(previewTax)} $</span>
                </div>
                <div className="mt-1 flex justify-between font-medium">
                  <span>Net versé à l'actionnaire</span>
                  <span className="text-emerald-400">{fmtMoney(previewNet)} $</span>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!valid || create.isPending}>
                  {create.isPending ? 'Enregistrement…' : 'Déclarer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
