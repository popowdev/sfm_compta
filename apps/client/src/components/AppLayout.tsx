import { useState, useEffect, type ComponentType, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Shield,
  ShieldOff,
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
  Gamepad2,
  ScrollText,
  Megaphone,
  LifeBuoy,
  TrendingUp,
  Wallet,
  SlidersHorizontal,
  Settings,
  LayoutList,
  ChevronDown,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  HelpCircle,
  Search,
  Lock,
} from 'lucide-react';
import { hasAppAccess, MODULES, moduleConfigBool } from '@rp-compta/shared';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { getMyCompanies, type MyCompany } from '@/lib/me';
import { getMyAssociations, type AssociationListItem } from '@/lib/associations';
import { getSupportTickets } from '@/lib/tickets';
import { getAnnouncementsSummary } from '@/lib/announcements';
import { moduleIcon } from '@/lib/moduleIcons';
import { QuickClock } from '@/components/QuickClock';
import { NotificationBell } from '@/components/NotificationBell';
import { ImportantAnnouncementPopup } from '@/components/ImportantAnnouncementPopup';
import { GuidedTour, type TourStep } from '@/components/GuidedTour';
import { MenuOrganizer } from '@/components/MenuOrganizer';
import { Credit } from '@/components/Credit';

function buildCompanyTour(slug: string | null | undefined): TourStep[] {
  const dash = slug ? `[data-tour="nav:/entreprise/${slug}"]` : undefined;
  return [
    { title: 'Bienvenue', body: 'Petit tour rapide de l’essentiel — tu peux le passer et le relancer plus tard avec le bouton « ? ».' },
    { target: '[data-tour="menu"]', title: 'Ton menu', body: 'Tes modules sont ici. Une entreprise neuve démarre avec les modules de base — tu en actives d’autres selon tes besoins.' },
    { target: dash, title: 'Tableau de bord', body: 'Ta vue d’ensemble : chiffres clés, alertes et activité récente de l’entreprise.' },
    { target: '[data-tour$="/m/exercices"]', title: 'Comptabilité', body: 'Le cœur du système : résultat, charges, paies et impôts, calculés semaine par semaine (les exercices).' },
    { target: '[data-tour$="/m/depenses"]', title: 'Dépenses', body: 'Enregistre les charges de l’entreprise (loyer, matériel, carburant…). Elles pèsent dans le résultat de la compta.' },
    { target: '[data-tour$="/m/rh"]', title: 'RH / employés', body: 'Tes employés : contrats, grille salariale, avertissements. La grille salariale alimente les paies de la compta.' },
    { target: '[data-tour$="/m/declarations"]', title: 'Déclarations fiscales', body: 'Déclare tes résultats à l’IRS directement depuis ici.' },
    { target: '[data-tour$="/m/subventions"]', title: 'Subventions', body: 'Suis tes demandes de subventions — dont le remboursement des salaires (heures badgeuse) par l’État.' },
    { target: '[data-tour$="/parametres"]', title: 'Paramètres de l’entreprise', body: 'Configure ton entreprise : informations, logo, grades et réglages propres à chaque module.' },
    { title: 'Activer plus de modules', body: 'Ton entreprise démarre avec les modules de base (compta, dépenses, RH, fiscalité…). Beaucoup d’autres existent — Caisse, Badgeuse (pointage → paies), Gestion Propriétés, Garage, Taxi… — à activer toi-même dans « Paramètres → Modules », entreprise par entreprise.' },
    { title: 'Les permissions', body: 'Chaque grade a ses droits, module par module : voir, créer, modifier, supprimer. Un employé ne voit que ce que son grade autorise — la compta et les paies restent réservées aux gérants.' },
    { title: 'C’est parti', body: 'Tu connais l’essentiel. Tu peux relancer ce tutoriel quand tu veux via le bouton « ? » en bas à droite.' },
  ];
}
const TOUR_FLAG = 'rp_compta_tour_v1';

const COMPANY_PAGE_KEYS = new Set<string>(MODULES.filter((m) => m.companyPage).map((m) => m.key));

const STORAGE_KEY = 'rp-compta.sidebar.collapsed';
const GROUPS_KEY = 'rp-compta.sidebar.groups';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  end?: boolean;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  locked?: boolean;
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
  const [menuOrgOpen, setMenuOrgOpen] = useState(false);

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

  const queryClient = useQueryClient();
  const roles = user?.appRoles ?? [];
  const isStaffRole = roles.includes('staff');
  const staffModeOn = user?.staffMode ?? true;
  const adminView = isStaffRole ? staffModeOn : true;
  const toggleStaffMode = async () => {
    await apiFetch('/api/me/staff-mode', {
      method: 'PUT',
      body: JSON.stringify({ enabled: !staffModeOn }),
    });
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    await queryClient.invalidateQueries({ queryKey: ['my-companies'] });
  };
  const isIrs = hasAppAccess(roles, 'irs');
  const isDev = user?.isDev ?? false;
  const roleLabel = roles.includes('staff') ? 'Staff' : roles.includes('irs') ? 'Agent IRS' : null;

  const myCompanies = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });
  const data = myCompanies.data ?? [];
  const myAssociations = useQuery({ queryKey: ['my-associations'], queryFn: getMyAssociations });
  const assocData = myAssociations.data ?? [];

  const supportQueue = useQuery({
    queryKey: ['support-tickets', {}],
    queryFn: () => getSupportTickets({}),
    enabled: isStaffRole && staffModeOn,
  });
  const openTickets = supportQueue.data?.open ?? 0;

  const annSummary = useQuery({ queryKey: ['announcement-summary'], queryFn: getAnnouncementsSummary, refetchInterval: 60_000 });
  const unreadAnnonces = annSummary.data?.unreadCount ?? 0;

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

  function companyNavGroups(c: MyCompany, opts?: { withMenuAction?: boolean; withLocked?: boolean }): NavGroup[] {
    const accessible = c.modules.filter(
      (m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked && m.canView,
    );
    const byKey = new Map(accessible.map((m) => [m.key as string, m]));
    const dash: NavItem = { to: `/entreprise/${c.company.slug}`, label: 'Tableau de bord', Icon: LayoutDashboard, end: true };
    const myPay: NavItem = { to: `/entreprise/${c.company.slug}/ma-paie`, label: 'Ma paie', Icon: Wallet };
    const navItem = (key: string, label: string): NavItem => ({
      to: `/entreprise/${c.company.slug}/m/${key}`,
      label,
      Icon: moduleIcon(key),
    });
    const layout = c.company.menuLayout;
    const groups: NavGroup[] = [];

    if (layout && Array.isArray(layout.items) && layout.items.length) {
      const validCat = new Set(layout.categories.map((cat) => cat.id));
      const byCat = new Map<string | null, string[]>();
      const used = new Set<string>();
      for (const it of layout.items) {
        if (!byKey.has(it.key) || used.has(it.key)) continue;
        const cid = it.categoryId && validCat.has(it.categoryId) ? it.categoryId : null;
        if (!byCat.has(cid)) byCat.set(cid, []);
        byCat.get(cid)!.push(it.key);
        used.add(it.key);
      }
      const top: NavItem[] = [dash, myPay];
      for (const k of byCat.get(null) ?? []) top.push(navItem(k, byKey.get(k)!.label));
      for (const m of accessible) if (!used.has(m.key)) top.push(navItem(m.key, m.label));
      groups.push({ title: null, items: top });
      for (const cat of layout.categories) {
        const keys = byCat.get(cat.id) ?? [];
        if (!keys.length) continue;
        groups.push({ title: cat.name, items: keys.map((k) => navItem(k, byKey.get(k)!.label)) });
      }
    } else {
      groups.push({ title: null, items: [dash, myPay, ...accessible.map((m) => navItem(m.key, m.label))] });
    }

    if (opts?.withLocked) {
      const locked = c.modules.filter(
        (m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked && !m.canView,
      );
      if (locked.length) {
        groups.push({
          title: 'Sans accès',
          items: locked.map((m) => ({ to: `#locked-${m.key}`, label: m.label, Icon: moduleIcon(m.key), locked: true })),
        });
      }
    }

    if (c.canManage) {
      const manageItems: NavItem[] = [
        { to: `/entreprise/${c.company.slug}/evenements`, label: 'Évènements', Icon: CalendarDays },
        { to: `/entreprise/${c.company.slug}/parametres`, label: 'Paramètres', Icon: Settings },
      ];
      if (opts?.withMenuAction) {
        manageItems.push({
          to: `/entreprise/${c.company.slug}/__organiser-menu`,
          label: 'Organiser le menu',
          Icon: LayoutList,
          onClick: () => setMenuOrgOpen(true),
        });
      }
      groups.push({ title: null, items: manageItems });
    }
    return groups;
  }

  const immersiveCompany = currentCompany !== null;
  const immersiveAssoc = activeAssocSlug !== null;
  const immersive = immersiveCompany || immersiveAssoc;
  let groups: NavGroup[];
  if (immersiveCompany) {
    groups = companyNavGroups(currentCompany!, { withMenuAction: true, withLocked: true });
  } else if (immersiveAssoc) {
    groups = [{ title: null, items: associationNavItems(activeAssocSlug!) }];
  } else {
    const companyGroups: NavGroup[] = data
      .filter((c) => c.fivemActive)
      .map((c) => {
        const items = companyNavGroups(c).flatMap((g) => g.items).filter((it) => !it.end);
        return { title: c.company.name, items, defaultClosed: isIrs };
      })
      .filter((g) => g.items.length > 0);
    groups = [
      {
        title: null,
        items: [
          { to: '/', label: 'Tableau de bord', Icon: LayoutDashboard, end: true },
          { to: '/calendrier', label: 'Calendrier', Icon: CalendarDays },
          { to: '/annonces', label: 'Annonces', Icon: Megaphone, badge: unreadAnnonces },
          { to: '/bourse', label: 'Bourse de parts', Icon: TrendingUp },
          ...(!isIrs && assocData.length > 0
            ? [{ to: '/associations', label: 'Associations', Icon: Landmark }]
            : []),
          { to: '/support', label: 'Support', Icon: LifeBuoy },
        ],
      },
      ...(isIrs && adminView
        ? [
            {
              title: 'IRS',
              items: [
                { to: '/entreprises', label: 'Entreprises', Icon: Building2 },
                { to: '/associations', label: 'Associations', Icon: Landmark },
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
      ...(isStaffRole && staffModeOn
        ? [
            {
              title: 'Staff',
              items: [
                { to: '/staff/support', label: 'Support', Icon: LifeBuoy, badge: openTickets },
                { to: '/comptes', label: 'Comptes', Icon: UsersRound },
                { to: '/fivem', label: 'Joueurs FiveM', Icon: Gamepad2 },
                { to: '/modules', label: 'Modules', Icon: SlidersHorizontal },
              ],
            },
          ]
        : []),
      ...(isDev
        ? [
            {
              title: 'Dev',
              items: [{ to: '/dev/logs-tickets', label: 'Logs tickets', Icon: ScrollText }],
            },
          ]
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

  const [tourOpen, setTourOpen] = useState(false);
  const [tourSteps, setTourSteps] = useState<TourStep[]>([]);
  const openTour = () => {
    setTourSteps(buildCompanyTour(activeSlug).filter((s) => !s.target || document.querySelector(s.target)));
    setTourOpen(true);
  };
  const startTour = openTour;
  const closeTour = () => { setTourOpen(false); localStorage.setItem(TOUR_FLAG, '1'); };
  const inCompany = immersive && !immersiveAssoc && !!currentCompany;
  const companyId = currentCompany?.company.id;
  useEffect(() => setMenuOrgOpen(false), [companyId]);
  useEffect(() => {
    if (!inCompany || localStorage.getItem(TOUR_FLAG)) return;
    const t = window.setTimeout(openTour, 900);
    return () => window.clearTimeout(t);
  }, [inCompany, companyId]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <ImportantAnnouncementPopup />
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
            !collapsed && <span className="text-lg font-bold tracking-tight">RP Compta</span>
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

        <nav data-tour="menu" className="flex-1 overflow-auto px-2 py-2">
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
                      if (it.locked) {
                        return (
                          <div
                            key={it.to}
                            title="Ton grade n'a pas accès à ce module — demande à ton patron."
                            className={`${navClass(false, collapsed)} cursor-not-allowed opacity-50`}
                          >
                            <it.Icon className="h-[18px] w-[18px] shrink-0" />
                            {!collapsed && <span className="truncate">{it.label}</span>}
                            {!collapsed && <Lock className="ml-auto h-3.5 w-3.5 shrink-0 opacity-80" />}
                          </div>
                        );
                      }
                      const badge = it.badge;
                      const inner = (
                        <>
                          <it.Icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="truncate">{it.label}</span>}
                          {!collapsed && !!badge && (
                            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                              {badge}
                            </span>
                          )}
                        </>
                      );
                      return it.onClick ? (
                        <button
                          key={it.to}
                          type="button"
                          onClick={it.onClick}
                          title={collapsed ? it.label : undefined}
                          className={`${navClass(false, collapsed)} w-full`}
                        >
                          {inner}
                        </button>
                      ) : it.active === undefined ? (
                        <NavLink
                          key={it.to}
                          to={it.to}
                          end={it.end}
                          data-tour={`nav:${it.to}`}
                          title={collapsed ? it.label : undefined}
                          className={({ isActive }) => navClass(isActive, collapsed)}
                        >
                          {inner}
                        </NavLink>
                      ) : (
                        <Link
                          key={it.to}
                          to={it.to}
                          data-tour={`nav:${it.to}`}
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
              {isStaffRole && (
                <button
                  type="button"
                  onClick={toggleStaffMode}
                  title={`Mode staff : ${staffModeOn ? 'ON — tu vois tout' : 'OFF — vue joueur'}`}
                  className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${
                    staffModeOn
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {staffModeOn ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                </button>
              )}
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
              {isStaffRole && (
                <button
                  type="button"
                  onClick={toggleStaffMode}
                  title={
                    staffModeOn
                      ? 'Tu vois toutes les entreprises (mode staff actif)'
                      : 'Tu navigues comme un joueur normal'
                  }
                  className={`mb-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors ${
                    staffModeOn
                      ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                      : 'border-input text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {staffModeOn ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                  Mode staff : {staffModeOn ? 'ON' : 'OFF'}
                </button>
              )}
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

      <main className="min-w-0 flex-1 overflow-auto">
        {children}
        <Credit />
      </main>

      {inCompany && !location.pathname.includes('/m/') && (
        <button
          type="button"
          onClick={startTour}
          title="Revoir le tutoriel"
          className="fixed bottom-4 right-4 z-[2500] grid h-11 w-11 place-items-center rounded-full border border-primary/40 bg-primary/15 text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary/25"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      )}
      <GuidedTour steps={tourSteps} open={tourOpen} onClose={closeTour} />
      {menuOrgOpen && currentCompany && currentCompany.canManage && (
        <MenuOrganizer
          companyId={currentCompany.company.id}
          modules={currentCompany.modules
            .filter((m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked)
            .map((m) => ({ key: m.key, label: m.label }))}
          initial={currentCompany.company.menuLayout}
          onClose={() => setMenuOrgOpen(false)}
        />
      )}
    </div>
  );
}
