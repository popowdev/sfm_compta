import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ArrowRight } from 'lucide-react';
import { hasAppAccess } from '@rp-compta/shared';
import { useAuth } from '@/auth/AuthContext';
import { IrsCockpit } from '@/components/IrsCockpit';
import { FivemCharacterCard } from '@/components/FivemCharacterCard';
import { getMyCompanies, type MyCompany } from '@/lib/me';
import { getCompanyStats } from '@/lib/stats';
import { fmtMoney } from '@/lib/declarations';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function hasStats(c: MyCompany): boolean {
  return c.modules.some((m) => m.key === 'stats' && m.enabled && !m.blocked && m.canView);
}

function CompanyOverview({ company }: { company: MyCompany }) {
  const { data } = useQuery({
    queryKey: ['stats', company.company.id],
    queryFn: () => getCompanyStats(company.company.id),
  });
  if (!data) return null;
  const { fiscal, expenses, subventions, hr } = data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi label="CA net (cumul)" value={`${fmtMoney(fiscal.caNet)} $`} />
      <Kpi label="Bénéfice" value={`${fmtMoney(fiscal.benefit)} $`} accent="text-primary" />
      <Kpi label="Impôts" value={`${fmtMoney(fiscal.totalTax)} $`} accent="text-amber-400" />
      <Kpi label="Dépenses" value={`${fmtMoney(expenses.total)} $`} accent="text-destructive" />
      <Kpi label="Subv. accordées" value={`${fmtMoney(subventions.granted)} $`} accent="text-emerald-400" />
      <Kpi label="Employés actifs" value={`${hr.active}`} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isStaff = (user?.appRoles ?? []).includes('staff');
  const isIrs = hasAppAccess(user?.appRoles ?? [], 'irs');
  const { data: companies, isLoading } = useQuery({
    queryKey: ['my-companies'],
    queryFn: getMyCompanies,
  });

  const all = companies ?? [];
  const list = isStaff ? all : all.filter((c) => c.fivemActive);
  const single = list.length === 1 ? list[0] : null;

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bonjour {user?.displayName}
          {isStaff ? ' · vue Staff (toutes les entreprises)' : ''}
        </p>
      </div>

      <FivemCharacterCard />

      {(isIrs || isStaff) && <IrsCockpit />}

      {single && hasStats(single) && <CompanyOverview company={single} />}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Aucune entreprise pour le moment.
        </div>
      ) : (
        <div>
          <div className="mb-3 text-sm font-semibold">
            {isStaff ? 'Entreprises' : 'Mes entreprises'}{' '}
            <span className="text-muted-foreground">({list.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <Link
                key={c.company.id}
                to={`/entreprise/${c.company.slug}`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background text-sm font-semibold text-primary">
                  {c.company.logoUrl ? (
                    <img src={c.company.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(c.company.name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.company.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    {isStaff ? 'Staff' : (c.grade?.name ?? 'Membre')}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
