import { Credit } from '@/components/Credit';
import { Button } from '@/components/ui/button';

export default function Login() {
  const error = new URLSearchParams(window.location.search).get('error');
  const message =
    error === 'state'
      ? 'Session expirée, réessaie.'
      : error
        ? 'Échec de la connexion Discord.'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow">
        <h1 className="text-xl font-bold tracking-tight">RP Compta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connecte-toi pour accéder à la plateforme.
        </p>
        {message && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        )}
        <a href="/api/auth/discord" className="mt-6 block">
          <Button className="w-full">Connexion avec Discord</Button>
        </a>
        <Credit />
      </div>
    </div>
  );
}
