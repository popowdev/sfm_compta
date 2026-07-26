import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Download, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv } from '@/lib/csv';
import { getTicketLogs, type TicketEvent } from '@/lib/tickets';

const TYPE_META: Record<string, { label: string; cls: string }> = {
  created: { label: 'Création', cls: 'bg-emerald-500/15 text-emerald-300' },
  member_reply: { label: 'Réponse joueur', cls: 'bg-sky-500/15 text-sky-300' },
  staff_reply: { label: 'Réponse staff', cls: 'bg-violet-500/15 text-violet-300' },
  staff_note: { label: 'Note interne', cls: 'bg-amber-500/15 text-amber-300' },
  status_change: { label: 'Statut', cls: 'bg-blue-500/15 text-blue-300' },
  priority_change: { label: 'Priorité', cls: 'bg-orange-500/15 text-orange-300' },
  assigned: { label: 'Assigné', cls: 'bg-teal-500/15 text-teal-300' },
  unassigned: { label: 'Désassigné', cls: 'bg-muted text-muted-foreground' },
  closed: { label: 'Fermeture', cls: 'bg-destructive/15 text-destructive' },
};
const typeMeta = (t: string) => TYPE_META[t] ?? { label: t, cls: 'bg-muted text-muted-foreground' };

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

const inputCls = 'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export default function TicketLogs() {
  const [ref, setRef] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['ticket-logs', ref, type, page], queryFn: () => getTicketLogs({ ref: ref || undefined, type: type || undefined, page }) });
  const events = q.data?.events ?? [];
  const total = q.data?.total ?? 0;
  const limit = q.data?.limit ?? 50;
  const pages = Math.max(1, Math.ceil(total / limit));
  const types = q.data?.types ?? [];

  const reset = () => { setRef(''); setType(''); setPage(1); };

  return (
    <div className="p-8">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">Dev</span>
        <h1 className="text-2xl font-bold tracking-tight">Logs tickets</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Journal complet des événements sur les tickets — création, réponses, changements de statut/priorité, assignations, fermetures.</p>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted-foreground">Référence</span>
          <input className={`${inputCls} w-40`} value={ref} onChange={(e) => { setRef(e.target.value.toUpperCase()); setPage(1); }} placeholder="ex. 1A2B" />
        </label>
        <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted-foreground">Type d'événement</span>
          <select className={`${inputCls} w-52`} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">Tous les types</option>
            {types.map((t) => <option key={t.type} value={t.type}>{typeMeta(t.type).label} ({t.count})</option>)}
          </select>
        </label>
        <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" /> Réinit.</Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{total} événement{total > 1 ? 's' : ''}</span>
          <Button
            variant="outline"
            disabled={events.length === 0}
            onClick={() => downloadCsv(
              'logs-tickets.csv',
              ['Date', 'Ref', 'Type', 'Acteur', 'Détail', 'Titre ticket'],
              events.map((e: TicketEvent) => [fmtDateTime(e.createdAt), e.ref, typeMeta(e.eventType).label, e.actorName ?? '', e.detail ?? '', e.ticketTitle ?? '']),
            )}
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {q.isLoading ? (
          <div className="space-y-2"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /></div>
        ) : total === 0 ? (
          <EmptyState icon={ScrollText} title="Aucun événement" hint="Les événements des tickets apparaîtront ici." />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Ticket</th>
                    <th className="px-4 py-3 text-left font-semibold">Événement</th>
                    <th className="px-4 py-3 text-left font-semibold">Acteur</th>
                    <th className="px-4 py-3 text-left font-semibold">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const m = typeMeta(e.eventType);
                    return (
                      <tr key={e.id} className="border-b last:border-b-0 hover:bg-accent/40">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                        <td className="px-4 py-3"><span className="font-mono font-semibold">#{e.ref}</span>{e.ticketTitle && <span className="ml-2 text-xs text-muted-foreground">{e.ticketTitle}</span>}</td>
                        <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span></td>
                        <td className="px-4 py-3 font-medium">{e.actorName ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.detail ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">Page {page}/{pages}</span>
                <div className="flex gap-1">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-40 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-md border disabled:opacity-40 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
