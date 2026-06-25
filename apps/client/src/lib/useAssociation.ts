import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAssociation, type AssociationDetail } from './associations';

export function useAssociation(): {
  slug: string | undefined;
  detail: AssociationDetail | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { slug } = useParams();
  const q = useQuery({
    queryKey: ['association', slug],
    queryFn: () => getAssociation(slug as string),
    enabled: !!slug,
  });
  return { slug, detail: q.data ?? null, isLoading: q.isLoading, isError: q.isError };
}
