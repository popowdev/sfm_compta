import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { moduleConfigBool } from '@rp-compta/shared';
import { useModulePerms } from '@/lib/useCompany';
import { SalesView } from '@/components/SalesView';
import { CatalogManager } from '@/components/CatalogManager';
import { getCatalog } from '@/lib/catalog';

export default function Caisse() {
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('caisse');
  const cfg = company?.modules.find((m) => m.key === 'caisse')?.config;
  const clientLink = moduleConfigBool(cfg, 'caisse', 'clients');
  const discountAllowed = moduleConfigBool(cfg, 'caisse', 'discount');
  const [tab, setTab] = useState<'ventes' | 'articles'>('ventes');

  const q = useQuery({ queryKey: ['catalog', companyId], queryFn: () => getCatalog(companyId) });
  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-lg border bg-muted/40 p-1">
        {(['ventes', 'articles'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'ventes' ? (
        <SalesView
          companyId={companyId}
          companyName={company?.company.name ?? 'Entreprise'}
          catalogItems={items}
          canCreate={canCreate}
          canDelete={canDelete}
          clientLink={clientLink}
          discountAllowed={discountAllowed}
        />
      ) : (
        <CatalogManager
          companyId={companyId}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}
