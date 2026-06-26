import { useState, type ComponentType, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Building2,
  UsersRound,
  Scale,
  FileText,
  HandCoins,
  Coins,
  MessagesSquare,
  FolderArchive,
  Landmark,
  CalendarDays,
  ScrollText,
  Wallet,
  SlidersHorizontal,
  Settings,
  ChevronDown,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Search,
} from 'lucide-react';
import { hasAppAccess, MODULES, moduleConfigBool } from '@rp-compta/shared';
import { useAuth } from '@/auth/AuthContext';
import { getMyCompanies, type MyCompany } from '@/lib/me';
import { getMyAssociations, type AssociationListItem } from '@/lib/associations';
import { moduleIcon } from '@/lib/moduleIcons';
import { QuickClock } from '@/components/QuickClock';
import { NotificationBell } from '@/components/NotificationBell';

const COMPANY_PAGE_KEYS = new Set<string>(MODULES.filter((m) => m.companyPage).map((m) => m.key));

const STORAGE_KEY = 'rp-compta.sidebar.collapsed';
const GROUPS_KEY = 'rp-compta.sidebar.groups';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  end?: boolean;
  active?: boolean;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
  defaultClosed?: boolean;
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
  const [search, setSearch] = useState('');

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  const toggleGroup = (title: string, currentlyClosed: boolean) =>
    setClosedGroups((g) => {
      const next = { ...g, [title]: !currentlyClosed };
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      return next;
    });

  const roles = user?.appRoles ?? [];
  const isIrs = hasAppAccess(roles, 'irs');
  const roleLabel = roles.includes('staff') ? 'Staff' : roles.includes('irs') ? 'Agent IRS' : null;

  const myCompanies = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });
  const data = myCompanies.data ?? [];
  const myAssociations = useQuery({ queryKey: ['my-associations'], queryFn: getMyAssociations });
  const assocData = myAssociations.data ?? [];

  const location = useLocation();
  const slugMatch = location.pathname.match(/^\/entreprise\/([^/]+)/);
  const activeSlug = slugMatch ? slugMatch[1] : null;
  const currentCompany: MyCompany | null = activeSlug
    ? (data.find((c) => c.company.slug === activeSlug) ?? null)
    : null;

  const assocSlugMatch = location.pathname.match(/^\/association\/([^/]+)/);
  const activeAssocSlug = assocSlugMatch ? assocSlugMatch[1] : null;
  const currentAssociation: AssociationListItem | null = activeAssocSlug
    ? (assocData.find((a) => a.slug === activeAssocSlug) ?? null)
    : null;

  function associationNavItems(slug: string): NavItem[] {
    return [
      { to: `/association/${slug}`, label: 'Tableau de bord', Icon: LayoutDashboard, end: true },
      { to: `/association/${slug}/membres`, label: 'Membres', Icon: UsersRound },
      { to: `/association/${slug}/tresorerie`, label: 'Trésorerie', Icon: Wallet },
      { to: `/association/${slug}/documents`, label: 'Documents', Icon: FolderArchive },
      { to: `/association/${slug}/parametres`, label: 'Paramètres', Icon: Settings },
    ];
  }

  function companyNavItems(c: MyCompany): NavItem[] {
    const accessible = c.modules.filter(
      (m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked && m.canView,
    );
    const items: NavItem[] = [
      { to: `/entreprise/${c.company.slug}`, label: 'Tableau de bord', Icon: LayoutDashboard, end: true },
    ];
    for (const m of accessible) {
      items.push({
        to: `/entreprise/${c.company.slug}/m/${m.key}`,
        label: m.label,
        Icon: moduleIcon(m.key),
      });
    }
    if (c.canManage) {
      items.push({ to: `/entreprise/${c.company.slug}/parametres`, label: 'Paramètres', Icon: Settings });
    }
    return items;
  }

  // Immersive per-company / per-association shell when inside one, else the global shell.
  const immersiveCompany = currentCompany !== null;
  const immersiveAssoc = activeAssocSlug !== null;
  const immersive = immersiveCompany || immersiveAssoc;
  let groups: NavGroup[];
  if (immersiveCompany) {
    groups = [{ title: null, items: companyNavItems(currentCompany!) }];
  } else if (immersiveAssoc) {
    groups = [{ title: null, items: associationNavItems(activeAssocSlug!) }];
  } else {
    const companyGroups: NavGroup[] = data
      .map((c) => {
        const items = companyNavItems(c).filter((it) => !it.end);
        return { title: c.company.name, items, defaultClosed: isIrs };
      })
      .filter((g) => g.items.length > 0);
    groups = [
      {
        title: null,
        items: [
          { to: '/', label: 'Tableau de bord', Icon: LayoutDashboard, end: true },
          { to: '/calendrier', label: 'Calendrier', Icon: CalendarDays },
          // Members who belong to an association keep a personal entry point
          // (the IRS registry lives in the IRS group below).
          ...(!isIrs && assocData.length > 0
            ? [{ to: '/associations', label: 'Associations', Icon: Landmark }]
            : []),
        ],
      },
      ...(isIrs
        ? [
            {
              title: 'IRS',
              items: [
                { to: '/entreprises', label: 'Entreprises', Icon: Building2 },
                { to: '/associations', label: 'Associations', Icon: Landmark },
                { to: '/comptes', label: 'Comptes', Icon: UsersRound },
                { to: '/declarations', label: 'Déclarations', Icon: FileText },
                { to: '/subventions', label: 'Subventions', Icon: HandCoins },
                { to: '/dividendes', label: 'Dividendes', Icon: Coins },
                { to: '/messages', label: 'Messagerie', Icon: MessagesSquare },
                { to: '/irs-documents', label: 'Documents', Icon: FolderArchive },
                { to: '/audit', label: 'Journal', Icon: ScrollText },
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
  }

  const term = search.trim().toLowerCase();
  const visibleGroups: NavGroup[] = term
    ? groups
        .map((g) => {
          const titleMatch = g.title?.toLowerCase().includes(term) ?? false;
          const items = titleMatch ? g.items : g.items.filter((it) => it.label.toLowerCase().includes(term));
          return { ...g, items };
        })
        .filter((g) => g.items.length > 0)
    : groups;

  const brandName = immersiveAssoc
    ? (currentAssociation?.name ?? activeAssocSlug ?? 'Association')
    : (currentCompany?.company.name ?? '');
  const brandLogo = immersiveAssoc ? (currentAssociation?.logoUrl ?? null) : (currentCompany?.company.logoUrl ?? null);
  const backTo = immersiveAssoc ? '/associations' : '/';
  const backLabel = immersiveAssoc ? 'Mes associations' : 'Mes entreprises';
  const badgeuseMod = currentCompany?.modules.find((m) => m.key === 'badgeuse');
  const showClock =
    immersive && !!badgeuseMod && badgeuseMod.enabled && !badgeuseMod.blocked && badgeuseMod.canView;
  const pausesEnabled = moduleConfigBool(badgeuseMod?.config, 'badgeuse', 'pauses');

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`flex h-16 items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
          {immersive ? (
            collapsed ? (
              <Link
                to={backTo}
                title={backLabel}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <ChevronLeft className="h-[18px] w-[18px]" />
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-2.5">
                {brandLogo ? (
                  <img src={brandLogo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                    {brandName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <Link to={backTo} className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-3 w-3" /> {backLabel}
                  </Link>
                  <div className="truncate text-sm font-semibold leading-tight">{brandName}</div>
                </div>
              </div>
            )
          ) : (
            !collapsed && <img src="/logo.png" alt="RP Compta" className="h-9 w-auto" />
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        </div>

        <nav className="flex-1 overflow-auto px-2 py-2">
          {!immersive && isIrs && !collapsed && (
            <div className="relative mb-2 px-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher menu / entreprise…"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          {visibleGroups.length === 0 && term && !collapsed && (
            <div className="px-3 py-4 text-sm text-muted-foreground">Aucun résultat.</div>
          )}
          {visibleGroups.map((g, gi) => {
            const effectiveClosed = g.title !== null && (closedGroups[g.title] ?? g.defaultClosed ?? false);
            const isClosed = !collapsed && !term && effectiveClosed;
            return (
              <div key={g.title ?? `g${gi}`} className={gi > 0 ? 'pt-2' : ''}>
                {g.title &&
                  (collapsed ? (
                    <div className="mx-2 my-2 border-t border-sidebar-accent" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.title!, effectiveClosed)}
                      className="flex w-full items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className="truncate">{g.title}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isClosed ? '-rotate-90' : ''}`} />
                    </button>
                  ))}
                {!isClosed && (
                  <div className="space-y-1">
                    {g.items.map((it) => {
                      const inner = (
                        <>
                          <it.Icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="truncate">{it.label}</span>}
                        </>
                      );
                      return it.active === undefined ? (
                        <NavLink
                          key={it.to}
                          to={it.to}
                          end={it.end}
                          title={collapsed ? it.label : undefined}
                          className={({ isActive }) => navClass(isActive, collapsed)}
                        >
                          {inner}
                        </NavLink>
                      ) : (
                        <Link
                          key={it.to}
                          to={it.to}
                          title={collapsed ? it.label : undefined}
                          aria-current={it.active ? 'page' : undefined}
                          className={navClass(it.active, collapsed)}
                        >
                          {inner}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t p-2">
          {showClock && currentCompany && (
            <QuickClock
              companyId={currentCompany.company.id}
              pausesEnabled={pausesEnabled}
              collapsed={collapsed}
            />
          )}
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <NotificationBell collapsed />
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
                {user?.avatarUrl && <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{user?.displayName}</div>
                  {roleLabel && <div className="text-xs text-primary">{roleLabel}</div>}
                </div>
                <NotificationBell collapsed={false} />
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
