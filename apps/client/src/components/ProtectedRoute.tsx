import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';

function NotWhitelisted() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow">
        <h1 className="text-lg font-bold">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ton compte Discord n'est pas whitelist sur le serveur.
        </p>
        <Button variant="outline" className="mt-6 w-full" onClick={() => logout()}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Chargement…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.whitelisted) return <NotWhitelisted />;
  return <>{children}</>;
}
