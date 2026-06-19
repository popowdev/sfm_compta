import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyCompanies } from '@/lib/me';
import Declarations from '@/pages/Declarations';

export default function ModulePage() {
  const { id, moduleKey } = useParams();
  const companyId = Number(id);
  const { data, isLoading } = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  const mine = data?.find((c) => c.company.id === companyId);
  const mod = mine?.modules.find((m) => m.key === moduleKey);
  if (!mine || !mod || !mod.enabled || mod.blocked || !mod.canView) {
    return <Navigate to="/" replace />;
  }

  if (moduleKey === 'declarations') return <Declarations />;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">{mod.label}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{mine.company.name}</p>
      <div className="mt-8 rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Interface « {mod.label} » à venir.
      </div>
    </div>
  );
}
