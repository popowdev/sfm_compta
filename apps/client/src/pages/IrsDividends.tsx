import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fmtMoney } from '@/lib/declarations';
import { getIrsDividends, decideDividend, type DividendStatus } from '@/lib/dividends';
import { SearchInput, FilterSelect } from '@/components/ui/filters';
import { useToast } from '@/components/ui/toast';
import { DIV_STATUS } from '@/pages/Dividendes';

const actionBtn =
  'rounded-md border border-input px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50';

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

export default function IrsDividends() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const q = useQuery({ queryKey: ['irs-dividends'], queryFn: () => getIrsDividends() });

  const decide = useMutation({
    mutationFn: (v: { id: number; status?: DividendStatus; transferValidated?: boolean }) =>
      decideDividend(v.id, { status: v.status, transferValidated: v.transferValidated }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['irs-dividends'] }),
    onError: () => toast('Échec de la mise à jour.', 'error'),
  });

  const all = q.data?.payouts ?? [];

  const totalGross = all.reduce((s, p) => s + p.gross, 0);
  const totalTax = all.reduce((s, p) => s + p.tax, 0);
  const totalNet = all.reduce((s, p) => s + p.net, 0);

  const companyOptions = (() => {
    const map = new Map<number, string>();
    for (const p of all) if (p.companyId != null) map.set(p.companyId, p.companyName ?? `#${p.companyId}`);
    return [...map.entries()]
      .map(([id, label]) => ({ value: String(id), label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  })();

  const term = search.trim().toLowerCase();
  const filtered = all.filter((p) => {
    if (company && String(p.companyId) !== company) return false;
    if (term) {
      const label = p.companyName ?? `#${p.companyId}`;
      const hay = `${label} ${p.shareholderName} ${p.reference}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dividendes déclarés</h1>
        <p className="text-sm text-muted-foreground">
          Suivi administratif des versements, des RIB bénéficiaires et de l'impôt IRS.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Déclarations" value={`${all.length}`} />
        <Kpi label="Brut distribué" value={`${fmtMoney(totalGross)} $`} accent="text-primary" />
        <Kpi label="Impôt IRS" value={`${fmtMoney(totalTax)} $`} accent="text-amber-400" />
        <Kpi label="Net actionnaires" value={`${fmtMoney(totalNet)} $`} accent="text-emerald-400" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4 text-sm font-semibold">Historique des dividendes</div>
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Entreprise, actionnaire, référence…"
            className="flex-1 min-w-[12rem] sm:max-w-xs"
          />
          <FilterSelect
            value={company}
            onChange={setCompany}
            options={companyOptions}
            allLabel="Toutes les entreprises"
            ariaLabel="Filtrer par entreprise"
          />
          <span className="ml-auto text-sm text-muted-foreground">{filtered.length} résultat(s)</span>
        </div>
        {q.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
        ) : all.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Aucun dividende déclaré.</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Aucun résultat pour ces filtres.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-semibold">Date</th>
                  <th className="px-4 py-2 text-left font-semibold">Entreprise</th>
                  <th className="px-4 py-2 text-left font-semibold">Actionnaire</th>
                  <th className="px-4 py-2 text-left font-semibold">RIB</th>
                  <th className="px-4 py-2 text-right font-semibold">Brut</th>
                  <th className="px-4 py-2 text-right font-semibold">Impôt</th>
                  <th className="px-4 py-2 text-right font-semibold">Net</th>
                  <th className="px-4 py-2 text-left font-semibold">Référence</th>
                  <th className="px-4 py-2 text-left font-semibold">Statut</th>
                  <th className="px-4 py-2 text-center font-semibold">Transfert</th>
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} className={i > 0 ? 'border-t' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                    <td className="px-4 py-2 font-medium">{p.companyName ?? `#${p.companyId}`}</td>
                    <td className="px-4 py-2">{p.shareholderName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.rib ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{fmtMoney(p.gross)} $</td>
                    <td className="px-4 py-2 text-right text-amber-400">{fmtMoney(p.tax)} $</td>
                    <td className="px-4 py-2 text-right font-medium text-emerald-400">{fmtMoney(p.net)} $</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.reference}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${DIV_STATUS[p.status]?.cls ?? ''}`}>
                        {DIV_STATUS[p.status]?.label ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-primary"
                          checked={p.transferValidated}
                          disabled={decide.isPending}
                          onChange={() => decide.mutate({ id: p.id, transferValidated: !p.transferValidated })}
                        />
                        validé
                      </label>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {p.status !== 'paid' && (
                          <button className={actionBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, status: 'paid' })}>
                            Payé
                          </button>
                        )}
                        {p.status !== 'cancelled' && (
                          <button className={actionBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, status: 'cancelled' })}>
                            Annulé
                          </button>
                        )}
                        {p.status !== 'pending' && (
                          <button className={actionBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, status: 'pending' })}>
                            Rouvrir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
