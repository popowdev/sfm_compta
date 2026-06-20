import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fmtMoney } from '@/lib/declarations';
import { getIrsDividends } from '@/lib/dividends';

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
  const [companyId, setCompanyId] = useState<number | ''>('');
  const q = useQuery({ queryKey: ['irs-dividends'], queryFn: () => getIrsDividends() });

  const all = q.data?.payouts ?? [];
  const companies = Array.from(new Map(all.map((p) => [p.companyId, p.companyName ?? `#${p.companyId}`])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = companyId ? all.filter((p) => p.companyId === companyId) : all;

  const totalGross = rows.reduce((s, p) => s + p.gross, 0);
  const totalTax = rows.reduce((s, p) => s + p.tax, 0);
  const totalNet = rows.reduce((s, p) => s + p.net, 0);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dividendes déclarés</h1>
        <p className="text-sm text-muted-foreground">
          Suivi administratif des versements, des RIB bénéficiaires et de l'impôt IRS.
        </p>
        <div className="mt-4 flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Entreprise</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : '')}
              className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Toutes les entreprises</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Déclarations" value={`${rows.length}`} />
        <Kpi label="Brut distribué" value={`${fmtMoney(totalGross)} $`} accent="text-primary" />
        <Kpi label="Impôt IRS" value={`${fmtMoney(totalTax)} $`} accent="text-amber-400" />
        <Kpi label="Net actionnaires" value={`${fmtMoney(totalNet)} $`} accent="text-emerald-400" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4 text-sm font-semibold">Historique des dividendes</div>
        {q.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Aucun dividende déclaré.</div>
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
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.id} className={i > 0 ? 'border-t' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                    <td className="px-4 py-2 font-medium">{p.companyName ?? `#${p.companyId}`}</td>
                    <td className="px-4 py-2">{p.shareholderName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.rib ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{fmtMoney(p.gross)} $</td>
                    <td className="px-4 py-2 text-right text-amber-400">{fmtMoney(p.tax)} $</td>
                    <td className="px-4 py-2 text-right font-medium text-emerald-400">{fmtMoney(p.net)} $</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.reference}</td>
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
