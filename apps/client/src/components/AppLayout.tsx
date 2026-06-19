import { useState, type ComponentType, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Building2,
  Scale,
  FileText,
  SlidersHorizontal,
  Settings,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  LogOut,
} from 'lucide-react';
import { hasAppAccess } from '@rp-compta/shared';
import { useAuth } from '@/auth/AuthContext';
import { getMyCompanies } from '@/lib/me';

const STORAGE_KEY = 'rp-compta.sidebar.collapsed';
const GROUPS_KEY = 'rp-compta.sidebar.groups';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

function navClass(isActive: boolean, collapsed: boolean): string {
  const base = `flex items-center rounded-md text-sm font-medium transition-colors ${
    collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
  }`;
  return isActive
    ? `${base} bg-sidebar-accent text-sidebar-primary`
    : `${base} text-muted-foreground hover:bg-sidebar-accent hover:text-foreground`;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}');
    } catch {
      return {};
    }
  });

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  const toggleGroup = (title: string) =>
    setClosedGroups((g) => {
      const next = { ...g, [title]: !g[title] };
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      return next;
    });

  const roles = user?.appRoles ?? [];
  const isIrs = hasAppAccess(roles, 'irs');
  const roleLabel = roles.includes('staff') ? 'Staff' : roles.includes('irs') ? 'Agent IRS' : null;

  const myCompanies = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });

  const companyGroups: NavGroup[] = (myCompanies.data ?? [])
    .map((c) => {
      const items: NavItem[] = c.modules
        .filter((m) => m.enabled && !m.blocked && m.canView)
        .map((m) => ({
          to: `/entreprise/${c.company.id}/m/${m.key}`,
          label: m.label,
          Icon: FileText,
        }));
      if (c.canManage) {
        items.push({
          to: `/entreprise/${c.company.id}/parametres`,
          label: 'Paramètres',
          Icon: Settings,
        });
      }
      return { title: c.company.name, items };
    })
    .filter((g) => g.items.length > 0);

  const groups: NavGroup[] = [
    { title: null, items: [{ to: '/', label: 'Tableau de bord', Icon: LayoutDashboard, end: true }] },
    ...(isIrs
      ? [
          {
            title: 'IRS',
            items: [
              { to: '/entreprises', label: 'Entreprises', Icon: Building2 },
              { to: '/declarations', label: 'Déclarations', Icon: FileText },
              { to: '/bareme', label: 'Barème fiscal', Icon: Scale },
            ],
          },
        ]
      : []),
    ...(roles.includes('staff')
      ? [{ title: 'Staff', items: [{ to: '/modules', label: 'Modules', Icon: SlidersHorizontal }] }]
      : []),
    ...companyGroups,
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div
          className={`flex h-16 items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-5'}`}
        >
          {!collapsed && <img src="/logo.png" alt="RP Compta" className="h-9 w-auto" />}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeft className="h-[18px] w-[18px]" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-auto px-2 py-2">
          {groups.map((g, gi) => {
            const isClosed = g.title !== null && !collapsed && closedGroups[g.title];
            return (
              <div key={g.title ?? `g${gi}`} className={gi > 0 ? 'pt-2' : ''}>
                {g.title &&
                  (collapsed ? (
                    <div className="mx-2 my-2 border-t border-sidebar-accent" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.title!)}
                      className="flex w-full items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className="truncate">{g.title}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${isClosed ? '-rotate-90' : ''}`}
                      />
                    </button>
                  ))}
                {!isClosed && (
                  <div className="space-y-1">
                    {g.items.map((it) => (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        end={it.end}
                        title={collapsed ? it.label : undefined}
                        className={({ isActive }) => navClass(isActive, collapsed)}
                      >
                        <it.Icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="truncate">{it.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t p-2">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              {user?.avatarUrl && <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />}
              <button
                type="button"
                onClick={() => logout()}
                title="Déconnexion"
                className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 px-2">
                {user?.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user?.displayName}</div>
                  {roleLabel && <div className="text-xs text-primary">{roleLabel}</div>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="h-9 w-full rounded-md border border-input text-sm font-medium text-card-foreground transition-colors hover:bg-accent"
              >
                Déconnexion
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
