import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Landmark, Users, Wallet } from 'lucide-react';
import { ASSOCIATION_MEMBER_ROLES } from '@rp-compta/shared';
import { useAuth } from '@/auth/AuthContext';
import { hasAppAccess } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { fmtMoney } from '@/lib/declarations';
import { getMyAssociations, createAssociation } from '@/lib/associations';

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ASSOCIATION_MEMBER_ROLES.map((r) => [r.key, r.label]));
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function Associations() {
  const { user } = useAuth();
  const isIrs = hasAppAccess(user?.appRoles ?? [], 'irs');
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['my-associations'], queryFn: getMyAssociations });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [objet, setObjet] = useState('');

  const create = useMutation({
    mutationFn: () => createAssociation({ name: name.trim(), objet: objet.trim() || undefined }),
    onSuccess: () => {
      setOpen(false);
      setName('');
      setObjet('');
      queryClient.invalidateQueries({ queryKey: ['my-associations'] });
    },
    onError: () => toast('Échec de la création.', 'error'),
  });

  const list = q.data ?? [];

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Associations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isIrs ? 'Registre des associations du serveur.' : 'Les associations dont tu fais partie.'}
          </p>
        </div>
        {isIrs && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle association
          </Button>
        )}
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Aucune association"
            hint={isIrs ? 'Crée la première association du serveur.' : 'Tu ne fais partie d’aucune association pour le moment.'}
            action={
              isIrs ? (
                <Button variant="outline" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nouvelle association
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <Link
                key={a.id}
                to={`/association/${a.slug}`}
                className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background text-sm font-semibold text-primary">
                    {a.logoUrl ? <img src={a.logoUrl} alt="" className="h-full w-full object-cover" /> : initials(a.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{a.name}</span>
                      {a.status === 'dissolved' && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">dissoute</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{a.objet || 'Sans objet défini'}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {a.memberCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" /> {fmtMoney(a.balance)} $
                  </span>
                  {a.role && (
                    <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                      {ROLE_LABEL[a.role] ?? a.role}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouvelle association</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && !create.isPending) create.mutate();
              }}
            >
              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-muted-foreground">Nom</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Objet (optionnel)</span>
                <input className={inputCls} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="ex. aide alimentaire" />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? 'Création…' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
