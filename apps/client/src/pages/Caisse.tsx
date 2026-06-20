import { useQuery } from '@tanstack/react-query';
import { moduleConfigBool } from '@rp-compta/shared';
import { useModulePerms } from '@/lib/useCompany';
import { SalesView } from '@/components/SalesView';
import { getCatalog } from '@/lib/catalog';

export default function Caisse() {
  const { company, companyId, canCreate, canDelete } = useModulePerms('caisse');
  const cfg = company?.modules.find((m) => m.key === 'caisse')?.config;
  const clientLink = moduleConfigBool(cfg, 'caisse', 'clients');
  const discountAllowed = moduleConfigBool(cfg, 'caisse', 'discount');

  const q = useQuery({ queryKey: ['catalog', companyId], queryFn: () => getCatalog(companyId) });
  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5">
      <SalesView
        companyId={companyId}
        companyName={company?.company.name ?? 'Entreprise'}
        catalogItems={items}
        canCreate={canCreate}
        canDelete={canDelete}
        clientLink={clientLink}
        discountAllowed={discountAllowed}
      />
    </div>
  );
}
