import { lazyRetry } from '@/lib/lazyRetry';
import { Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { MODULES } from '@rp-compta/shared';
import { type MyModule } from '@/lib/me';
import { useCompany } from '@/lib/useCompany';
import { moduleIcon } from '@/lib/moduleIcons';
import { TourDemoProvider } from '@/components/TourDemo';
import { ModuleTour } from '@/components/ModuleTour';

const Declarations = lazyRetry(() => import('@/pages/Declarations'));
const Depenses = lazyRetry(() => import('@/pages/Depenses'));
const Subventions = lazyRetry(() => import('@/pages/Subventions'));
const Messagerie = lazyRetry(() => import('@/pages/Messagerie'));
const Employes = lazyRetry(() => import('@/pages/Employes'));
const Stats = lazyRetry(() => import('@/pages/Stats'));
const Badgeuse = lazyRetry(() => import('@/pages/Badgeuse'));
const Locations = lazyRetry(() => import('@/pages/Locations'));
const Clients = lazyRetry(() => import('@/pages/Clients'));
const Stocks = lazyRetry(() => import('@/pages/Stocks'));
const Exercices = lazyRetry(() => import('@/pages/Exercices'));
const Caisse = lazyRetry(() => import('@/pages/Caisse'));
const Garage = lazyRetry(() => import('@/pages/Garage'));
const Dividendes = lazyRetry(() => import('@/pages/Dividendes'));
const Documents = lazyRetry(() => import('@/pages/Documents'));
const Actionnaires = lazyRetry(() => import('@/pages/Actionnaires'));
const Immobilier = lazyRetry(() => import('@/pages/Immobilier'));
const ImmoCarte = lazyRetry(() => import('@/pages/ImmoCarte'));
const Taxi = lazyRetry(() => import('@/pages/Taxi'));
const Pawnshop = lazyRetry(() => import('@/pages/Pawnshop'));
const Runs = lazyRetry(() => import('@/pages/Runs'));
const Chasse = lazyRetry(() => import('@/pages/Chasse'));

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

const CONTENT: Partial<Record<string, LazyExoticComponent<ComponentType>>> = {
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
  caisse: Caisse,
  garage: Garage,
  dividendes: Dividendes,
  documents: Documents,
  actionnaires: Actionnaires,
  immobilier: Immobilier,
  immo_carte: ImmoCarte,
  taxi: Taxi,
  pawnshop: Pawnshop,
  runs: Runs,
  chasse: Chasse,
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
  const { company: mine, isLoading } = useCompany();

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  const mod = mine?.modules.find((m) => m.key === moduleKey);
  if (!mine || !mod || !COMPANY_PAGE_KEYS.has(mod.key) || !mod.enabled || mod.blocked || !mod.canView) {
    return <Navigate to="/" replace />;
  }

  const Body = CONTENT[mod.key];

  return (
    <TourDemoProvider>
      <div className="p-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {mine.company.name}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{mod.label}</h1>

        <div className="mt-6">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Chargement…</div>}>
            {Body ? <Body /> : <Placeholder mod={mod} />}
          </Suspense>
        </div>
      </div>
      <ModuleTour moduleKey={mod.key} />
    </TourDemoProvider>
  );
}
