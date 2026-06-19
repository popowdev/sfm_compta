import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MODULES } from '@rp-compta/shared';
import { getMyCompanies } from '@/lib/me';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

export default function EntrepriseIndex() {
  const { id } = useParams();
  const companyId = Number(id);
  const { data, isLoading } = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  const mine = data?.find((c) => c.company.id === companyId);
  if (!mine) return <Navigate to="/" replace />;

  const first = mine.modules.find(
    (m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked && m.canView,
  );
  if (first) return <Navigate to={`/entreprise/${companyId}/m/${first.key}`} replace />;
  if (mine.canManage) return <Navigate to={`/entreprise/${companyId}/parametres`} replace />;
  return (
    <div className="p-8 text-sm text-muted-foreground">Aucune page accessible pour ton grade.</div>
  );
}
