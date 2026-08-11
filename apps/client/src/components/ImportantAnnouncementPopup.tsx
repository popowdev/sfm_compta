import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X, Wrench, Megaphone, ArrowRight, Check } from 'lucide-react';
import { getAnnouncementsSummary, markAnnouncementRead } from '@/lib/announcements';

export function ImportantAnnouncementPopup() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ['announcement-summary'],
    queryFn: getAnnouncementsSummary,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const ann = q.data?.important ?? null;

  const markRead = useMutation({
    mutationFn: (id: number) => markAnnouncementRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcement-summary'] });
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  if (!ann || dismissed === ann.id) return null;
  const isDev = ann.type === 'dev';

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0f] text-white shadow-2xl">
        <div className="relative p-7">
          <button type="button" onClick={() => setDismissed(ann.id)} aria-label="Fermer"
            className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>

          <div className="mb-3 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${isDev ? 'bg-orange-500/20 text-orange-300' : 'bg-sky-500/20 text-sky-300'}`}>
              {isDev ? <Wrench className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}
              {isDev ? 'Annonce dev · HRP' : 'Communiqué IRS'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-300">Importante</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">{ann.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{ann.body}</p>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <Link to="/annonces" onClick={() => setDismissed(ann.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white">
              Voir toutes les annonces <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" disabled={markRead.isPending} onClick={() => markRead.mutate(ann.id)}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60">
              <Check className="h-4 w-4" /> {markRead.isPending ? '…' : "J'ai lu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
