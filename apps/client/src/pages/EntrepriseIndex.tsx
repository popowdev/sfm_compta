import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MODULES } from '@rp-compta/shared';
import {
  ShoppingCart,
  TrendingUp,
  Receipt,
  Boxes,
  Users,
  Wallet,
  AlertTriangle,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { fmtMoney } from '@/lib/declarations';
import { useCompany } from '@/lib/useCompany';
import { getCompanyDashboard } from '@/lib/dashboard';
import { groupIcon } from '@/lib/moduleIcons';
import { Kpi } from '@/components/ui/kpi';
import { MyAccessCard } from '@/components/MyAccessCard';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));
const AXIS = 'rgba(148,163,184,0.6)';
const GRID = 'rgba(148,163,184,0.15)';
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
};
const money = (n: number) => `${fmtMoney(n)} $`;
const fmtDay = (d: string) => {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

export default function EntrepriseIndex() {
  const { company: mine, companyId, slug, isLoading } = useCompany();
  const q = useQuery({
    queryKey: ['dashboard', companyId],
    queryFn: () => getCompanyDashboard(companyId),
    enabled: !!companyId,
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (!mine) return <Navigate to="/" replace />;

  const accessible = mine.modules.filter(
    (m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked && m.canView,
  );
  const quick: { group: string; key: string }[] = [];
  const seen = new Set<string>();
  for (const m of accessible) {
    if (seen.has(m.group)) continue;
    seen.add(m.group);
    quick.push({ group: m.group, key: m.key });
  }

  const d = q.data;
  const hasSales = (d?.sales.total ?? 0) > 0;

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Espace entreprise</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{mine.company.name}</h1>
        <p className="text-sm text-muted-foreground">
          {mine.canManage ? "Vue d'ensemble de ta compta" : `Ton espace ${mine.company.name}`}{mine.grade ? ` — grade ${mine.grade.name}` : ' — Staff'}.
        </p>
      </div>

      {!mine.canManage && (
        <div className="mb-6">
          <MyAccessCard modules={mine.modules} gradeName={mine.grade?.name ?? null} slug={slug} />
        </div>
      )}

      {q.isError ? (
        <div className="grid place-items-center gap-3 py-12 text-sm text-muted-foreground">
          <div>Impossible de charger le tableau de bord.</div>
          <button
            onClick={() => q.refetch()}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Réessayer
          </button>
        </div>
      ) : !d ? (
        <div className="text-sm text-muted-foreground">Chargement du tableau de bord…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={ShoppingCart} label="CA (30 j)" value={money(d.sales.total)} accent="text-primary" />
            <Kpi icon={TrendingUp} label="Marge (30 j)" value={money(d.sales.margin)} accent="text-emerald-400" />
            <Kpi icon={Receipt} label="Ventes (30 j)" value={`${d.sales.count}`} />
            <Kpi icon={Boxes} label="Valeur stock" value={money(d.stock.totalValue)} accent="text-sky-400" />
            <Kpi icon={Users} label="Employés actifs" value={`${d.hr.active}`} />
            <Kpi icon={Wallet} label="Créances clients" value={money(d.clients.debt)} accent={d.clients.debt > 0 ? 'text-amber-400' : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border bg-card p-5 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Chiffre d'affaires — 30 derniers jours</h3>
              {!hasSales ? (
                <div className="grid h-56 place-items-center text-sm text-muted-foreground">
                  Pas encore de ventes. Lance la Caisse pour voir ton CA apparaître ici.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={d.sales.byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashCa" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: AXIS }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: AXIS }} width={48} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} formatter={(v) => [money(v as number), 'CA']} />
                    <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} fill="url(#dashCa)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-400" /> Alertes
                </h3>
                <div className="space-y-2 text-sm">
                  {d.openExercices > 0 && (
                    <Link to={`/entreprise/${slug}/m/exercices`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent">
                      <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground" /> {d.openExercices} exercice(s) ouvert(s)</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  )}
                  {d.stock.lowCount > 0 ? (
                    <div className="rounded-lg border px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 font-medium text-amber-400">
                        <Boxes className="h-4 w-4" /> {d.stock.lowCount} article(s) en stock bas
                      </div>
                      <ul className="space-y-0.5">
                        {d.stock.lowItems.slice(0, 5).map((it) => (
                          <li key={it.id} className="flex justify-between text-xs text-muted-foreground">
                            <span>{it.name}</span>
                            <span>{it.quantity.toLocaleString('fr-FR')} {it.unit} / seuil {it.threshold.toLocaleString('fr-FR')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    d.openExercices === 0 && <div className="text-xs text-muted-foreground">Rien à signaler. 👌</div>
                  )}
                </div>
              </div>

              {d.sales.topProducts.length > 0 && (
                <div className="rounded-xl border bg-card p-5">
                  <h3 className="mb-2 text-sm font-semibold">Top articles (30 j)</h3>
                  <ul className="space-y-1.5">
                    {d.sales.topProducts.map((p) => (
                      <li key={p.name} className="flex items-center justify-between text-sm">
                        <span className="truncate">{p.name}</span>
                        <span className="font-medium text-emerald-400">{money(p.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {quick.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">Accès rapide</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {quick.map((it) => {
                  const Icon = groupIcon(it.group);
                  return (
                    <Link
                      key={it.group}
                      to={`/entreprise/${slug}/m/${it.key}`}
                      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <span className="text-sm font-medium">{it.group}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
