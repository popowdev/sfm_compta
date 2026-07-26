import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Search, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import {
  getFivemPlayers,
  lookupFivemPlayer,
  applyFivemPlayer,
  type GameCharacter,
} from '@/lib/fivem';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/filters';
import { useToast } from '@/components/ui/toast';

function reasonLabel(code: string): string {
  switch (code) {
    case 'not_found':
      return 'Joueur introuvable sur le serveur de jeu.';
    case 'char_not_found':
      return 'Personnage introuvable.';
    case 'invalid':
      return 'Discord ID invalide.';
    case 'unconfigured':
      return 'API du serveur de jeu non configurée.';
    default:
      return 'Serveur de jeu injoignable.';
  }
}

function FivemSyncPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [discordId, setDiscordId] = useState('');
  const [chars, setChars] = useState<GameCharacter[] | null>(null);
  const [target, setTarget] = useState('');

  const lookup = useMutation({
    mutationFn: () => lookupFivemPlayer(discordId.trim()),
    onSuccess: (d) => {
      setChars(d.characters);
      setTarget(discordId.trim());
    },
    onError: (err) => {
      setChars(null);
      toast(reasonLabel(err instanceof Error ? err.message : ''), 'error');
    },
  });

  const apply = useMutation({
    mutationFn: (name: string) => applyFivemPlayer(target, name),
    onSuccess: (d) => {
      toast(
        d.job ? `Accès attribué : ${d.job}.` : 'Personnage sans job — accès entreprise révoqué.',
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['fivem-players'] });
      queryClient.invalidateQueries({ queryKey: ['my-companies'] });
    },
    onError: (err) => toast(reasonLabel(err instanceof Error ? err.message : ''), 'error'),
  });

  const valid = /^\d{5,32}$/.test(discordId.trim());

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Synchroniser un joueur (par Discord ID)</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Récupère les personnages du joueur depuis le serveur de jeu et attribue l'accès selon le job du personnage choisi.
      </p>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) lookup.mutate();
        }}
      >
        <input
          value={discordId}
          onChange={(e) => setDiscordId(e.target.value)}
          placeholder="Discord ID (ex : 123456789012345678)"
          inputMode="numeric"
          className="min-w-[14rem] flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
        />
        <Button type="submit" disabled={!valid || lookup.isPending}>
          {lookup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Chercher
        </Button>
      </form>

      {chars &&
        (chars.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">Aucun personnage pour ce joueur.</div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Personnage</th>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Grade</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {chars.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{c.name || '—'}</td>
                    <td className="px-3 py-2">
                      {c.unemployed ? <span className="text-muted-foreground">Chômage</span> : c.job}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.unemployed ? '—' : `${c.gradeLabel} (${c.grade})`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.unemployed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={apply.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Révoquer tout accès entreprise de ce joueur ? (personnage « ${c.name} » au chômage)`,
                              )
                            )
                              apply.mutate(c.name);
                          }}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Révoquer
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={apply.isPending} onClick={() => apply.mutate(c.name)}>
                          <UserPlus className="h-3.5 w-3.5" />
                          Attribuer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

const ROSTER_PAGE_SIZE = 25;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Fivem() {
  const [rosterSearch, setRosterSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebouncedValue(rosterSearch, 300);
  useEffect(() => {
    setPage(1);
  }, [term]);
  const q = useQuery({
    queryKey: ['fivem-players', page, term],
    queryFn: () => getFivemPlayers({ page, limit: ROSTER_PAGE_SIZE, q: term || undefined }),
    placeholderData: (prev) => prev,
  });
  const filteredPlayers = q.data?.players ?? [];
  const total = q.data?.total ?? 0;
  const online = q.data?.stats.online ?? 0;
  const known = q.data?.stats.known ?? 0;
  const jobsCount = q.data?.stats.jobs ?? 0;

  return (
    <div className="space-y-6 p-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">IRS</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Joueurs FiveM</h1>
        <p className="text-sm text-muted-foreground">Synchronisé en direct depuis le serveur de jeu (ESX).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">En ligne</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{online}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Joueurs connus</div>
          <div className="mt-1 text-2xl font-bold">{known}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Jobs actifs</div>
          <div className="mt-1 text-2xl font-bold">{jobsCount}</div>
        </div>
      </div>

      <FivemSyncPanel />

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Base de données joueurs</h2>
            <p className="text-xs text-muted-foreground">
              {known} joueur{known > 1 ? 's' : ''} connu{known > 1 ? 's' : ''}
              {term ? ` · ${total} résultat${total > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <SearchInput
            value={rosterSearch}
            onChange={setRosterSearch}
            placeholder="Rechercher (nom, job, Discord ID)…"
            className="w-full sm:w-72"
          />
        </div>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : q.isError ? (
          <div className="py-4 text-sm text-destructive">Impossible de charger les joueurs.</div>
        ) : known === 0 ? (
          <EmptyState
            icon={Gamepad2}
            title="Aucun joueur synchronisé"
            hint="Synchronise un joueur ci-dessus, ou laisse la connexion au site / le cron peupler la base."
          />
        ) : filteredPlayers.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">Aucun joueur pour cette recherche.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Statut</th>
                  <th className="py-2 pr-3 font-medium">Nom</th>
                  <th className="py-2 pr-3 font-medium">Job</th>
                  <th className="py-2 pr-3 font-medium">Grade</th>
                  <th className="py-2 pr-3 font-medium">Discord</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center gap-1.5 ${p.online ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
                        {p.online ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-medium">{p.name || '—'}</td>
                    <td className="py-2 pr-3">{p.job || '—'}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.jobGrade}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{p.discordId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} limit={ROSTER_PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
