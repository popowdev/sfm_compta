import { type ComponentType } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { MODULES } from '@rp-compta/shared';
import { type MyModule } from '@/lib/me';
import { useCompany } from '@/lib/useCompany';
import { moduleIcon } from '@/lib/moduleIcons';
import Declarations from '@/pages/Declarations';
import Depenses from '@/pages/Depenses';
import Subventions from '@/pages/Subventions';
import Messagerie from '@/pages/Messagerie';
import Employes from '@/pages/Employes';
import Stats from '@/pages/Stats';
import Badgeuse from '@/pages/Badgeuse';
import Locations from '@/pages/Locations';
import Clients from '@/pages/Clients';
import Stocks from '@/pages/Stocks';
import Exercices from '@/pages/Exercices';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

const CONTENT: Partial<Record<string, ComponentType>> = {
  declarations: Declarations,
  depenses: Depenses,
  subventions: Subventions,
  messagerie: Messagerie,
  rh: Employes,
  stats: Stats,
  badgeuse: Badgeuse,
  locations: Locations,
  clients: Clients,
  stocks: Stocks,
  exercices: Exercices,
};

function Placeholder({ mod }: { mod: MyModule }) {
  const Icon = moduleIcon(mod.key);
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">Interface « {mod.label} » à venir.</p>
    </div>
  );
}

export default function ModulePage() {
  const { moduleKey } = useParams();
  const { company: mine, slug, isLoading } = useCompany();

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  const mod = mine?.modules.find((m) => m.key === moduleKey);
  if (!mine || !mod || !COMPANY_PAGE_KEYS.has(mod.key) || !mod.enabled || mod.blocked || !mod.canView) {
    return <Navigate to="/" replace />;
  }

  const tabs = mine.modules.filter(
    (m) => COMPANY_PAGE_KEYS.has(m.key) && m.group === mod.group && m.enabled && !m.blocked && m.canView,
  );
  const Body = CONTENT[mod.key];

  return (
    <div className="p-8">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {mine.company.name}
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        {tabs.length > 1 ? mod.group : mod.label}
      </h1>

      {tabs.length > 1 && (
        <div className="mt-5 flex gap-1 overflow-x-auto border-b">
          {tabs.map((t) => {
            const Icon = moduleIcon(t.key);
            const isActive = t.key === mod.key;
            return (
              <Link
                key={t.key}
                to={`/entreprise/${slug}/m/${t.key}`}
                aria-current={isActive ? 'page' : undefined}
                className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6">{Body ? <Body /> : <Placeholder mod={mod} />}</div>
    </div>
  );
}
