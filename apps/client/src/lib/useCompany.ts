import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ModuleKey } from '@rp-compta/shared';
import { getMyCompanies, type MyCompany } from './me';

export function useCompany(): {
  slug: string | undefined;
  company: MyCompany | null;
  companyId: number;
  isLoading: boolean;
} {
  const { slug } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });
  const company = data?.find((c) => c.company.slug === slug) ?? null;
  return { slug, company, companyId: company?.company.id ?? 0, isLoading };
}

export function useModulePerms(moduleKey: ModuleKey): {
  companyId: number;
  company: MyCompany | null;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
} {
  const { company, companyId } = useCompany();
  const m = company?.modules.find((x) => x.key === moduleKey);
  return {
    companyId,
    company,
    canView: m?.canView ?? false,
    canCreate: m?.canCreate ?? false,
    canEdit: m?.canEdit ?? false,
    canDelete: m?.canDelete ?? false,
  };
}
