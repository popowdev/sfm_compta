import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldOff, UserX, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import {
  getAdminUsers,
  setUserIrs,
  setUserWhitelist,
  deleteAdminUser,
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

function fmtDate(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function IrsUsers() {
  const { user } = useAuth();
  const isStaff = (user?.appRoles ?? []).includes('staff');
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['admin-users'], queryFn: getAdminUsers });
  const [search, setSearch] = useState('');

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
          ? 'Impossible : c\'est le dernier compte avec ce rôle.'
          : 'Suppression refusée (Staff requis).',
      );
    },
  });

  const term = search.trim().toLowerCase();
  const users = (q.data?.users ?? []).filter(
    (u) => !term || `${u.displayName} ${u.discordId} ${u.companies.join(' ')}`.toLowerCase().includes(term),
  );

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration des comptes</h1>
        <p className="text-sm text-muted-foreground">
          Joueurs reliés par Discord. Activation / désactivation de l'accès, attribution du rôle IRS
          (Staff). La synchro automatique FiveM/Discord viendra alimenter cette liste.
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom, Discord, entreprise)…"
          className="mt-4 h-9 w-80 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Utilisateur</th>
              <th className="px-4 py-2 text-left font-semibold">Rôles</th>
              <th className="px-4 py-2 text-left font-semibold">Entreprises</th>
              <th className="px-4 py-2 text-left font-semibold">Accès</th>
              <th className="px-4 py-2 text-left font-semibold">Créé le</th>
              <th className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">Chargement…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">Aucun utilisateur.</td></tr>
            ) : (
              users.map((u: AdminUser) => {
                const hasIrs = u.roles.includes('irs');
                const isSelf = u.discordId === user?.discordId;
                return (
                  <tr key={u.id} className="border-t align-middle">
                    <td className="px-4 py-2.5">
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
                          <div className="text-xs text-muted-foreground">{u.discordId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
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
                    <td className="px-4 py-2.5">
                      {u.companies.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="text-xs">{u.companies.join(', ')}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${u.whitelisted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                        {u.whitelisted ? 'actif' : 'désactivé'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!isSelf && (
                          <Button
                            variant="outline"
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
      </div>
    </div>
  );
}
