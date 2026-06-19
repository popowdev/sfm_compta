import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@rp-compta/shared';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/api/health'),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <img src="/logo.png" alt="RP Compta" className="h-9 w-auto" />
        <div className="flex items-center gap-3">
          {user?.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
          )}
          <span className="text-sm font-medium">{user?.displayName}</span>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            Déconnexion
          </Button>
        </div>
      </header>
      <main className="p-6">
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connecté · API {data ? `en ligne v${data.version}` : '…'}
        </p>
      </main>
    </div>
  );
}
