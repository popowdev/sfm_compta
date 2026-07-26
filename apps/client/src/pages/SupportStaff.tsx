import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { LifeBuoy, ArrowLeft, Send, Lock, UserCheck, Search, CheckCircle2, X, RotateCcw } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm';
import { TICKET_TYPES, TICKET_PRIORITIES, TICKET_STATUSES } from '@rp-compta/shared';
import type { TicketType, TicketPriority, TicketStatus } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/auth/AuthContext';
import { StatusBadge, PriorityBadge, TypeBadge, Thread, AttachPicker, fmtWhen } from '@/components/TicketBits';
import {
  getSupportTickets,
  getSupportTicket,
  replyToSupportTicket,
  patchSupportTicket,
  reactToSupportTicketMessage,
  type SupportFilters,
} from '@/lib/tickets';

const selectCls =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function TicketDetailView({ refId }: { refId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const q = useQuery({ queryKey: ['support-ticket', refId], queryFn: () => getSupportTicket(refId) });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['support-ticket', refId] });
    queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
  };

  const send = useMutation({
    mutationFn: () => replyToSupportTicket(refId, reply.trim(), internal, files),
    onSuccess: () => {
      setReply('');
      setInternal(false);
      setFiles([]);
      invalidate();
    },
    onError: () => toast('Échec de l’envoi.', 'error'),
  });
  const patch = useMutation({
    mutationFn: (p: { status?: TicketStatus; priority?: TicketPriority; assignToMe?: boolean; unassign?: boolean }) =>
      patchSupportTicket(refId, p),
    onSuccess: invalidate,
    onError: () => toast('Échec de la mise à jour.', 'error'),
  });
  const react = useMutation({
    mutationFn: (v: { messageId: number; emoji: string }) => reactToSupportTicketMessage(refId, v.messageId, v.emoji),
    onSuccess: invalidate,
    onError: () => toast('Échec.', 'error'),
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (q.isError || !q.data) return <EmptyState icon={LifeBuoy} title="Ticket introuvable" />;

  const { ticket, messages } = q.data;
  const meId = user ? Number(user.id) : null;
  const assignedToMe = meId !== null && ticket.assignedUserId === meId;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <button
        type="button"
        onClick={() => navigate('/staff/support')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        File de support
      </button>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">#{ticket.ref}</span>
          <h1 className="text-base font-semibold">{ticket.title}</h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TypeBadge type={ticket.type} />
          <span>par <span className="text-foreground">{ticket.authorName ?? '—'}</span></span>
          {ticket.companyName && <span>· {ticket.companyName}</span>}
          <span>· ouvert le {fmtWhen(ticket.createdAt)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <Button variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" onClick={() => patch.mutate({ status: 'resolved' })}>
              <CheckCircle2 className="h-4 w-4" /> Marquer résolu
            </Button>
          )}
          {(ticket.status === 'resolved' || ticket.status === 'closed') && (
            <Button variant="outline" onClick={() => patch.mutate({ status: 'waiting_staff' })}>
              <RotateCcw className="h-4 w-4" /> Réouvrir
            </Button>
          )}
          {ticket.status !== 'closed' && (
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (await confirm({ title: 'Fermer ce ticket ?', message: 'La conversation sera close. Tu pourras le rouvrir ensuite si nécessaire.', confirmLabel: 'Fermer le ticket', destructive: true })) patch.mutate({ status: 'closed' });
              }}
            >
              <X className="h-4 w-4" /> Fermer le ticket
            </Button>
          )}
          <select
            className={selectCls}
            value={ticket.priority}
            onChange={(e) => patch.mutate({ priority: e.target.value as TicketPriority })}
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>Priorité : {p.label}</option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => patch.mutate(assignedToMe ? { unassign: true } : { assignToMe: true })}
          >
            <UserCheck className="h-4 w-4" />
            {assignedToMe ? 'Me retirer' : 'M’assigner'}
          </Button>
        </div>

        {(ticket.contextPath || ticket.contextErrorCode) && (
          <div className="mt-3 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Contexte</div>
            {ticket.contextPath && <div>Page : <span className="font-mono">{ticket.contextPath}</span></div>}
            {ticket.contextErrorCode && (
              <div>Code d’erreur : <span className="font-mono text-primary">{ticket.contextErrorCode}</span></div>
            )}
            {ticket.contextAgent && <div className="truncate">Navigateur : {ticket.contextAgent}</div>}
          </div>
        )}
      </div>

      <Thread messages={messages} meId={meId} onReact={ticket.status === 'closed' ? undefined : (messageId, emoji) => react.mutate({ messageId, emoji })} />

      {ticket.status === 'closed' ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
          Ticket fermé. Utilise « Réouvrir » pour reprendre la conversation.
        </div>
      ) : (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (reply.trim() && !send.isPending) send.mutate();
        }}
      >
        <textarea
          className={`min-h-24 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring ${
            internal ? 'border-amber-500/50' : 'border-input'
          }`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={internal ? 'Note interne — invisible pour le joueur…' : 'Réponse au joueur…'}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInternal(!internal)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              internal ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-input text-muted-foreground hover:bg-accent'
            }`}
          >
            <Lock className="h-4 w-4" />
            Note interne
          </button>
          <AttachPicker files={files} setFiles={setFiles} />
          <Button type="submit" className="ml-auto" disabled={!reply.trim() || send.isPending}>
            <Send className="h-4 w-4" />
            {internal ? 'Enregistrer la note' : 'Répondre'}
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}

export default function SupportStaff() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SupportFilters>({});
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['support-tickets', filters],
    queryFn: () => getSupportTickets(filters),
    enabled: !ref,
  });

  if (ref) return <TicketDetailView refId={ref} />;

  const data = q.data;
  const list = data?.tickets ?? [];
  const setF = (patch: Partial<SupportFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.open} ticket${data.open > 1 ? 's' : ''} ouvert${data.open > 1 ? 's' : ''}` : '…'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={filters.status ?? ''} onChange={(e) => setF({ status: (e.target.value || undefined) as TicketStatus })}>
          <option value="">Tous les statuts</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select className={selectCls} value={filters.priority ?? ''} onChange={(e) => setF({ priority: (e.target.value || undefined) as TicketPriority })}>
          <option value="">Toutes priorités</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <select className={selectCls} value={filters.type ?? ''} onChange={(e) => setF({ type: (e.target.value || undefined) as TicketType })}>
          <option value="">Tous les types</option>
          {TICKET_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setF({ mine: filters.mine ? undefined : true })}
          className={`h-9 rounded-md border px-3 text-sm transition-colors ${
            filters.mine ? 'border-primary/50 bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-accent'
          }`}
        >
          Assignés à moi
        </button>
        <form
          className="relative ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setF({ q: search.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Titre ou #code"
          />
        </form>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Aucun ticket" hint="Rien à traiter avec ces filtres." />
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => navigate(`/staff/support/${t.ref}`)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50"
            >
              <span className="font-mono text-xs text-muted-foreground">#{t.ref}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.authorName ?? '—'}</span>
              <TypeBadge type={t.type} />
              <PriorityBadge priority={t.priority} />
              <StatusBadge status={t.status} />
              <span className="text-xs text-muted-foreground">{fmtWhen(t.lastMessageAt ?? t.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
