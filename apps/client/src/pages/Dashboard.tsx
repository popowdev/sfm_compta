import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@rp-compta/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/lib/api';

export default function Dashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/api/health'),
    retry: false,
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bienvenue {user?.displayName} · API {data ? `en ligne v${data.version}` : '…'}
      </p>
    </div>
  );
}
