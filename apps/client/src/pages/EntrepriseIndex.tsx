import { Navigate } from 'react-router-dom';
import { MODULES } from '@rp-compta/shared';
import { useCompany } from '@/lib/useCompany';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

export default function EntrepriseIndex() {
  const { company: mine, slug, isLoading } = useCompany();

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (!mine) return <Navigate to="/" replace />;

  const first = mine.modules.find(
    (m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked && m.canView,
  );
  if (first) return <Navigate to={`/entreprise/${slug}/m/${first.key}`} replace />;
  if (mine.canManage) return <Navigate to={`/entreprise/${slug}/parametres`} replace />;
  return (
    <div className="p-8 text-sm text-muted-foreground">Aucune page accessible pour ton grade.</div>
  );
}
