import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Megaphone, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from '@/lib/announcements';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

export default function Annonces() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['announcements'], queryFn: getAnnouncements });
  const canManage = q.data?.canManage ?? false;
  const list = q.data?.announcements ?? [];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['announcements'] });
  const create = useMutation({
    mutationFn: () => createAnnouncement({ title: title.trim(), body: body.trim(), pinned }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setBody('');
      setPinned(false);
      invalidate();
    },
    onError: () => toast('Échec de la publication.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteAnnouncement(id),
    onSuccess: invalidate,
    onError: () => toast('Échec de la suppression.', 'error'),
  });

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Annonces</h1>
          <p className="mt-1 text-sm text-muted-foreground">Communiqués officiels de l’IRS.</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle annonce
          </Button>
        )}
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={Megaphone} title="Aucune annonce" hint="Les communiqués de l’IRS apparaîtront ici." />
        ) : (
          <div className="space-y-3">
            {list.map((a) => (
              <div key={a.id} className={`rounded-xl border bg-card p-5 ${a.pinned ? 'border-primary/40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {a.pinned && <Pin className="h-4 w-4 shrink-0 text-primary" />}
                      <h3 className="text-base font-semibold">{a.title}</h3>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {a.createdByName} · {fmtDateTime(a.createdAt)}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: 'Supprimer cette annonce ?', message: a.title, destructive: true })) remove.mutate(a.id);
                      }}
                      title="Supprimer"
                      aria-label={`Supprimer ${a.title}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouvelle annonce</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim() && body.trim() && !create.isPending) create.mutate();
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Titre</span>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Message</span>
                <textarea className={`${inputCls} h-32 py-2`} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                <span>Épingler en haut</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={!title.trim() || !body.trim() || create.isPending}>
                  {create.isPending ? 'Publication…' : 'Publier'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
