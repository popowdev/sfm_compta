import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Landmark, HandCoins, FileText, Coins, TrendingUp, ArrowRight, MessageSquare, PieChart } from 'lucide-react';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtMoney } from '@/lib/declarations';
import { getIrsOverview } from '@/lib/irsOverview';

function fmtAgo(d: string): string {
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function IrsCockpit() {
  const q = useQuery({ queryKey: ['irs-overview'], queryFn: getIrsOverview });
  const d = q.data;

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!d) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Building2} label="Entreprises" value={String(d.kpis.companies)} />
        <Kpi icon={Landmark} label="Associations" value={String(d.kpis.associations)} />
        <Kpi
          icon={HandCoins}
          label="Subv. en attente"
          value={String(d.kpis.pendingSubventions)}
          accent={d.kpis.pendingSubventions > 0 ? 'text-amber-400' : undefined}
        />
        <Kpi
          icon={FileText}
          label="Décl. à traiter"
          value={String(d.kpis.submittedDeclarations)}
          accent={d.kpis.submittedDeclarations > 0 ? 'text-amber-400' : undefined}
        />
        <Kpi icon={Coins} label="Impôts perçus" value={`${fmtMoney(d.kpis.taxesCollected)} $`} accent="text-primary" />
        <Kpi icon={TrendingUp} label="CA déclaré" value={`${fmtMoney(d.kpis.caDeclared)} $`} accent="text-emerald-400" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Subventions en attente" to="/subventions" count={d.kpis.pendingSubventions}>
          {d.pendingSubventions.length === 0 ? (
            <Done />
          ) : (
            d.pendingSubventions.map((s) => (
              <Row key={s.id} title={s.motif} sub={s.companyName} right={`${fmtMoney(s.amountRequested)} $`} ago={s.createdAt} />
            ))
          )}
        </Panel>

        <Panel title="Déclarations à traiter" to="/declarations" count={d.kpis.submittedDeclarations}>
          {d.submittedDeclarations.length === 0 ? (
            <Done />
          ) : (
            d.submittedDeclarations.map((dec) => (
              <Row key={dec.id} title={dec.companyName} sub={dec.weekLabel} right={`${fmtMoney(dec.totalTax)} $`} ago={dec.createdAt} />
            ))
          )}
        </Panel>

        <Panel title="Derniers messages" to="/messages">
          {d.recentMessages.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Aucun message.</p>
          ) : (
            d.recentMessages.map((m) => (
              <Row
                key={m.id}
                icon={<MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                title={m.companyName}
                sub={`${m.fromIrs ? 'IRS' : m.senderName} : ${m.body}`}
                ago={m.createdAt}
              />
            ))
          )}
        </Panel>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PieChart className="h-4 w-4 text-muted-foreground" /> Parts des entreprises
          </h3>
          <Link to="/entreprises" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
            Voir <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {d.companiesShares.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Aucune entreprise.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">Entreprise</th>
                  <th className="px-2 py-2 text-right font-semibold">Valorisation</th>
                  <th className="px-2 py-2 text-right font-semibold">Valeur/part</th>
                  <th className="px-2 py-2 text-right font-semibold">Actionnaires</th>
                  <th className="px-2 py-2 text-right font-semibold">Parts attribuées</th>
                </tr>
              </thead>
              <tbody>
                {d.companiesShares.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2 font-medium">{c.name}</td>
                    <td className="px-2 py-2 text-right">{fmtMoney(c.valuation)} $</td>
                    <td className="px-2 py-2 text-right text-emerald-400">{fmtMoney(c.valuation / 100)} $</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{c.shareholderCount}</td>
                    <td className={`px-2 py-2 text-right font-medium ${c.attributedPct > 100 ? 'text-destructive' : ''}`}>
                      {c.attributedPct.toLocaleString('fr-FR')} %
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

function Panel({
  title,
  to,
  count,
  children,
}: {
  title: string;
  to: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-400">{count}</span>
          )}
        </h3>
        <Link to={to} className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
          Voir <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  title,
  sub,
  right,
  ago,
  icon,
}: {
  title: string;
  sub: string;
  right?: string;
  ago: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      {right && <span className="shrink-0 text-sm font-medium text-primary">{right}</span>}
      <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">{fmtAgo(ago)}</span>
    </div>
  );
}

function Done() {
  return <p className="px-1 py-2 text-xs text-muted-foreground">Rien à traiter pour le moment.</p>;
}
