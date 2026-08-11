import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Megaphone, Pin, Wrench, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { getAnnouncements, createAnnouncement, deleteAnnouncement, markAnnouncementRead, type AnnouncementType } from '@/lib/announcements';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

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
  const canPostDev = q.data?.canPostDev ?? false;
  const list = q.data?.announcements ?? [];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [type, setType] = useState<AnnouncementType>('irs');
  const [important, setImportant] = useState(false);

  const markedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const unread = list.filter((a) => !a.read && !markedRef.current.has(a.id));
    if (!unread.length) return;
    unread.forEach((a) => markedRef.current.add(a.id));
    Promise.all(unread.map((a) => markAnnouncementRead(a.id).catch(() => {}))).then(() => {
      queryClient.invalidateQueries({ queryKey: ['announcement-summary'] });
    });
  }, [list, queryClient]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['announcements'] });
    queryClient.invalidateQueries({ queryKey: ['announcement-summary'] });
  };
  const create = useMutation({
    mutationFn: () => createAnnouncement({ title: title.trim(), body: body.trim(), pinned, type, important }),
    onSuccess: () => {
      setOpen(false); setTitle(''); setBody(''); setPinned(false); setType('irs'); setImportant(false);
      invalidate();
      toast('Annonce publiée.', 'success');
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
          <p className="mt-1 text-sm text-muted-foreground">Communiqués officiels de l’IRS et annonces dev (HRP).</p>
        </div>
        {canManage && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouvelle annonce</Button>}
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={Megaphone} title="Aucune annonce" hint="Les communiqués de l’IRS apparaîtront ici." />
        ) : (
          <div className="space-y-3">
            {list.map((a) => (
              <div key={a.id} className={`rounded-xl border bg-card p-5 ${a.important ? 'border-red-500/50 bg-red-500/[0.03]' : a.pinned ? 'border-primary/40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.pinned && <Pin className="h-4 w-4 shrink-0 text-primary" />}
                      {a.type === 'dev' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-400"><Wrench className="h-3 w-3" /> Dev · HRP</span>
                      )}
                      {a.important && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400"><AlertTriangle className="h-3 w-3" /> Importante</span>
                      )}
                      <h3 className="text-base font-semibold">{a.title}</h3>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.createdByName} · {fmtDateTime(a.createdAt)}</div>
                  </div>
                  {canManage && (
                    <button type="button"
                      onClick={async () => { if (await confirm({ title: 'Supprimer cette annonce ?', message: a.title, destructive: true })) remove.mutate(a.id); }}
                      title="Supprimer" aria-label={`Supprimer ${a.title}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouvelle annonce</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (title.trim() && body.trim() && !create.isPending) create.mutate(); }}>
              {canPostDev && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Type</span>
                  <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as AnnouncementType)}>
                    <option value="irs">Communiqué IRS</option>
                    <option value="dev">🛠️ Annonce dev (HRP)</option>
                  </select>
                </label>
              )}
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
              <label className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input accent-red-500" checked={important} onChange={(e) => setImportant(e.target.checked)} />
                <span><span className="font-semibold">Annonce importante</span><span className="block text-xs text-muted-foreground">Affiche une pop-up en plein écran aux joueurs qui ne l'ont pas encore lue, jusqu'à ce qu'ils cliquent « J'ai lu ».</span></span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={!title.trim() || !body.trim() || create.isPending}>{create.isPending ? 'Publication…' : 'Publier'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
