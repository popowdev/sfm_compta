import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('API indisponible');
  return res.json();
}

export default function App() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 font-sans text-foreground">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow">
        <img src="/logo.png" alt="RP Compta" className="mb-5 h-14 w-auto" />
        <h1 className="text-2xl font-bold tracking-tight">RP Compta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plateforme fiscale — fondations en place (Phase&nbsp;0).
        </p>

        <div className="mt-5 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">API :</span>
          {isLoading && <span className="text-muted-foreground">vérification…</span>}
          {isError && (
            <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
              hors ligne
            </span>
          )}
          {data && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
              en ligne · v{data.version}
            </span>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <Button>Action primaire</Button>
          <Button variant="outline">Secondaire</Button>
        </div>
      </div>
    </div>
  );
}
