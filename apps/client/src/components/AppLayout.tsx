import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';

function navClass({ isActive }: { isActive: boolean }) {
  const base = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors';
  return isActive
    ? `${base} bg-sidebar-accent text-sidebar-primary`
    : `${base} text-muted-foreground hover:bg-sidebar-accent hover:text-foreground`;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const isIrs = user?.appRoles.includes('irs') ?? false;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-16 items-center px-5">
          <img src="/logo.png" alt="RP Compta" className="h-9 w-auto" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          <NavLink to="/" end className={navClass}>
            <LayoutDashboard className="h-[18px] w-[18px]" />
            Tableau de bord
          </NavLink>
          {isIrs && (
            <NavLink to="/entreprises" className={navClass}>
              <Building2 className="h-[18px] w-[18px]" />
              Entreprises
            </NavLink>
          )}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            {user?.avatarUrl && (
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.displayName}</div>
              {isIrs && <div className="text-xs text-primary">Agent IRS</div>}
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => logout()}>
            Déconnexion
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
