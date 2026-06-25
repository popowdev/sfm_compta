import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChart as PieIcon, Coins, Users } from 'lucide-react';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useModulePerms } from '@/lib/useCompany';
import { fmtMoney } from '@/lib/declarations';
import { getMyShareholders } from '@/lib/shareholders';

const COLORS = ['#34d399', '#2dd4bf', '#22c55e', '#10b981', '#059669', '#14b8a6', '#84cc16', '#06b6d4'];
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
};

export default function Actionnaires() {
  const { companyId } = useModulePerms('actionnaires');
  const q = useQuery({ queryKey: ['shareholders', companyId], queryFn: () => getMyShareholders(companyId) });

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const valuation = q.data?.valuation ?? 0;
  const list = q.data?.shareholders ?? [];
  const partValue = valuation / 100;
  const totalPct = list.reduce((s, h) => s + h.percentage, 0);
  const chartData = list.map((h) => ({ name: h.name, value: h.percentage }));
  if (totalPct < 100) {
    chartData.push({ name: 'Non attribué', value: Math.round((100 - totalPct) * 100) / 100 });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi icon={Coins} label="Valorisation" value={`${fmtMoney(valuation)} $`} accent="text-primary" />
        <Kpi icon={PieIcon} label="Valeur d'une part" value={`${fmtMoney(partValue)} $`} accent="text-emerald-400" />
        <Kpi icon={Users} label="Actionnaires" value={String(list.length)} />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={PieIcon}
          title="Aucun actionnaire"
          hint="La répartition du capital est gérée par l'IRS et apparaîtra ici."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Répartition du capital</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={55}
                  paddingAngle={2}
                  stroke="var(--card)"
                >
                  {chartData.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={d.name === 'Non attribué' ? 'var(--muted)' : COLORS[i % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, n) => [`${v.toLocaleString('fr-FR')} %`, n as string]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-semibold">Actionnaire</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Parts</th>
                    <th className="px-4 py-3 text-right font-semibold">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((h, i) => (
                    <tr key={h.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          {h.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{h.shareType}</td>
                      <td className="px-4 py-3 text-right font-medium">{h.percentage.toLocaleString('fr-FR')} %</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {fmtMoney((valuation * h.percentage) / 100)} $
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td className="px-4 py-3 font-semibold" colSpan={2}>
                      Total attribué
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${totalPct > 100 ? 'text-destructive' : ''}`}>
                      {totalPct.toLocaleString('fr-FR')} %
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtMoney((valuation * totalPct) / 100)} $</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
