import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Users } from 'lucide-react';
import { ASSOCIATION_MEMBER_ROLES, type AssociationMemberRole } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { ApiError } from '@/lib/api';
import { AssocPage } from '@/components/AssocPage';
import {
  getAssociationMembers,
  addAssociationMember,
  updateAssociationMember,
  removeAssociationMember,
} from '@/lib/associations';

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ASSOCIATION_MEMBER_ROLES.map((r) => [r.key, r.label]));
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function MembersBody({ associationId }: { associationId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({
    queryKey: ['association-members', associationId],
    queryFn: () => getAssociationMembers(associationId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['association-members', associationId] });

  const [open, setOpen] = useState(false);
  const [discordId, setDiscordId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<AssociationMemberRole>('membre');

  const add = useMutation({
    mutationFn: () => addAssociationMember(associationId, { discordId: discordId.trim(), displayName: displayName.trim() || undefined, role }),
    onSuccess: () => {
      setOpen(false);
      setDiscordId('');
      setDisplayName('');
      setRole('membre');
      invalidate();
    },
    onError: (e) =>
      toast(e instanceof ApiError && e.code === 'duplicate' ? 'Ce membre est déjà dans l’association.' : 'Échec de l’ajout.', 'error'),
  });
  const changeRole = useMutation({
    mutationFn: (v: { mid: number; role: AssociationMemberRole }) => updateAssociationMember(associationId, v.mid, v.role),
    onSuccess: invalidate,
    onError: () => toast('Échec du changement de rôle.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (mid: number) => removeAssociationMember(associationId, mid),
    onSuccess: invalidate,
    onError: () => toast('Échec du retrait.', 'error'),
  });

  const canManage = q.data?.canManage ?? false;
  const members = q.data?.members ?? [];

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Ajouter un membre
          </Button>
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title="Aucun membre" hint="Ajoute le bureau et les membres de l’association." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {members.map((m, i) => (
            <div key={m.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="truncate text-xs text-muted-foreground">Discord {m.discordId}</div>
              </div>
              {canManage ? (
                <select
                  className={`${inputCls} h-8 w-36`}
                  value={m.role}
                  onChange={(e) => changeRole.mutate({ mid: m.id, role: e.target.value as AssociationMemberRole })}
                >
                  {ASSOCIATION_MEMBER_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm({ title: 'Retirer ce membre ?', message: m.name, destructive: true })) remove.mutate(m.id);
                  }}
                  title="Retirer"
                  aria-label={`Retirer ${m.name}`}
                  className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Ajouter un membre</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^\d{5,32}$/.test(discordId.trim()) && !add.isPending) add.mutate();
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">ID Discord</span>
                <input className={inputCls} value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="123456789012345678" autoFocus />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Nom affiché (optionnel)</span>
                <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Rôle</span>
                <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as AssociationMemberRole)}>
                  {ASSOCIATION_MEMBER_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={!/^\d{5,32}$/.test(discordId.trim()) || add.isPending}>
                  {add.isPending ? 'Ajout…' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssociationMembers() {
  return <AssocPage title="Membres & bureau">{(d) => <MembersBody associationId={d.association.id} />}</AssocPage>;
}
