import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MODULES } from '@rp-compta/shared';
import { getMyCompanies } from '@/lib/me';
import { moduleIcon } from '@/lib/moduleIcons';
import Declarations from '@/pages/Declarations';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

export default function ModulePage() {
  const { id, moduleKey } = useParams();
  const companyId = Number(id);
  const { data, isLoading } = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  const mine = data?.find((c) => c.company.id === companyId);
  const mod = mine?.modules.find((m) => m.key === moduleKey);
  if (!mine || !mod || !COMPANY_PAGE_KEYS.has(mod.key) || !mod.enabled || mod.blocked || !mod.canView) {
    return <Navigate to="/" replace />;
  }

  if (moduleKey === 'declarations') return <Declarations />;

  const Icon = moduleIcon(mod.key);
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">{mod.label}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{mine.company.name}</p>
      <div className="mt-8 grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
        <Icon className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Interface « {mod.label} » à venir.</p>
      </div>
    </div>
  );
}
