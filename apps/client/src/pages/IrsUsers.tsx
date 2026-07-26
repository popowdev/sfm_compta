import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldOff, UserX, Power, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput, FilterSelect } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import {
  getAdminUsers,
  setUserIrs,
  setUserWhitelist,
  deleteAdminUser,
  resyncFivemUser,
  type AdminUser,
} from '@/lib/admin';

const ROLE_BADGE: Record<string, string> = {
  staff: 'bg-violet-500/15 text-violet-300',
  irs: 'bg-sky-500/15 text-sky-300',
  gouvernement: 'bg-amber-500/15 text-amber-300',
};
const ROLE_LABEL: Record<string, string> = {
  staff: 'Staff',
  irs: 'IRS',
  gouvernement: 'Gouvernement',
};

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function IrsUsers() {
  const { user } = useAuth();
  const isStaff = (user?.appRoles ?? []).includes('staff');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [whitelistFilter, setWhitelistFilter] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 300);
  useEffect(() => {
    setPage(1);
  }, [term, roleFilter, whitelistFilter]);
  const q = useQuery({
    queryKey: ['admin-users', page, term, roleFilter, whitelistFilter],
    queryFn: () =>
      getAdminUsers({
        page,
        limit: PAGE_SIZE,
        q: term || undefined,
        role: roleFilter || undefined,
        whitelisted: whitelistFilter || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  const irs = useMutation({
    mutationFn: (v: { id: number; grant: boolean }) => setUserIrs(v.id, v.grant),
    onSuccess: invalidate,
    onError: () => alert('Action réservée au Staff.'),
  });
  const wl = useMutation({
    mutationFn: (v: { id: number; whitelisted: boolean }) => setUserWhitelist(v.id, v.whitelisted),
    onSuccess: invalidate,
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      alert(
        code === 'forbidden'
          ? 'Désactiver un compte Staff/Gouvernement est réservé au Staff.'
          : code === 'cannot_disable_self'
            ? 'Tu ne peux pas désactiver ton propre accès.'
            : "Échec du changement d'accès.",
      );
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    onSuccess: invalidate,
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      alert(
        code === 'last_staff' || code === 'last_irs'
          ? "Impossible : c'est le dernier compte avec ce rôle."
          : 'Suppression refusée (Staff requis).',
      );
    },
  });
  const resync = useMutation({
    mutationFn: (id: number) => resyncFivemUser(id),
    onSuccess: (r) => {
      invalidate();
      toast(`Synchronisé — ${r.count} personnage(s) récupéré(s).`, 'success');
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      toast(
        code === 'not_found'
          ? 'Joueur introuvable sur le serveur de jeu.'
          : code === 'unconfigured'
            ? 'API du serveur de jeu non configurée.'
            : 'Serveur de jeu injoignable.',
        'error',
      );
    },
  });

  const rows = q.data?.users ?? [];
  const total = q.data?.total ?? 0;
  const roleOptions = [
    ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
    { value: '__none__', label: 'Sans rôle' },
  ];

  return (
    <div className="space-y-6 p-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Comptes joueurs</h1>
        <p className="text-sm text-muted-foreground">
          Un compte Discord par ligne : ses personnages synchronisés, les entreprises auxquelles il a
          accès, ses rôles. Attribution automatique via la synchro FiveM.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher (nom, Discord, personnage, entreprise)…"
          className="flex-1 min-w-[12rem] sm:w-72 sm:flex-none"
        />
        <FilterSelect
          value={roleFilter}
          onChange={setRoleFilter}
          options={roleOptions}
          allLabel="Tous les rôles"
          ariaLabel="Filtrer par rôle"
        />
        <FilterSelect
          value={whitelistFilter}
          onChange={setWhitelistFilter}
          options={[
            { value: 'actif', label: 'Actif' },
            { value: 'inactif', label: 'Inactif' },
          ]}
          allLabel="Tous les accès"
          ariaLabel="Filtrer par accès"
        />
        <span className="ml-auto text-sm text-muted-foreground">{total} compte(s)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Compte Discord</th>
              <th className="px-4 py-2 text-left font-semibold">Personnages (nom / prénom)</th>
              <th className="px-4 py-2 text-left font-semibold">Entreprises &amp; grade</th>
              <th className="px-4 py-2 text-left font-semibold">Rôles</th>
              <th className="px-4 py-2 text-left font-semibold">Accès</th>
              <th className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">Chargement…</td></tr>
            ) : q.isError ? (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-destructive">Impossible de charger les comptes.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">Aucun résultat pour ces filtres.</td></tr>
            ) : (
              rows.map((u: AdminUser) => {
                const hasIrs = u.roles.includes('irs');
                const isSelf = u.discordId === user?.discordId;
                return (
                  <tr key={u.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {u.displayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="leading-tight">
                          <div className="font-medium">{u.displayName}</div>
                          <div className="font-mono text-xs text-muted-foreground">{u.discordId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.characters.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {u.characters.map((c) => (
                            <div key={c.name} className="flex items-center gap-1.5 text-xs">
                              {c.selected && (
                                <span title="Personnage actif" className="text-primary">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                              <span className={c.selected ? 'font-semibold text-foreground' : 'text-foreground'}>
                                {c.name || '—'}
                              </span>
                              <span className="text-muted-foreground">
                                {c.unemployed
                                  ? '· Chômage'
                                  : `· ${c.job}${c.gradeLabel ? ` (${c.gradeLabel})` : ''}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.companies.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {u.companies.map((c, i) => (
                            <div key={i} className="text-xs">
                              <span className="font-medium text-foreground">{c.name}</span>
                              {c.grade && <span className="text-muted-foreground"> · {c.grade}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          u.roles.map((r) => (
                            <span key={r} className={`rounded-md px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[r] ?? 'bg-muted text-muted-foreground'}`}>
                              {ROLE_LABEL[r] ?? r}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${u.whitelisted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                        {u.whitelisted ? 'actif' : 'désactivé'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resync.mutate(u.id)}
                          disabled={resync.isPending}
                          title="Re-synchroniser depuis le serveur de jeu"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${resync.isPending && resync.variables === u.id ? 'animate-spin' : ''}`} />
                          Sync
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => wl.mutate({ id: u.id, whitelisted: !u.whitelisted })}
                            disabled={wl.isPending}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {u.whitelisted ? 'Désactiver' : 'Activer'}
                          </Button>
                        )}
                        {isStaff && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => irs.mutate({ id: u.id, grant: !hasIrs })}
                            disabled={irs.isPending}
                          >
                            {hasIrs ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                            {hasIrs ? 'Retirer IRS' : 'Donner IRS'}
                          </Button>
                        )}
                        {isStaff && !isSelf && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Supprimer définitivement ${u.displayName} ?`)) del.mutate(u.id);
                            }}
                            title="Supprimer"
                            className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
