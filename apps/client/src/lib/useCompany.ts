import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
