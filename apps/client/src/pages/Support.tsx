import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, X, LifeBuoy, ArrowLeft, Send } from 'lucide-react';
import { TICKET_TYPES, TICKET_PRIORITIES } from '@rp-compta/shared';
import type { TicketType, TicketPriority } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/auth/AuthContext';
import { StatusBadge, PriorityBadge, TypeBadge, Thread, AttachPicker, fmtWhen } from '@/components/TicketBits';
import { ApiError } from '@/lib/api';
import { getMyTickets, getMyTicket, createTicket, replyToMyTicket, closeMyTicket, reactToMyTicketMessage } from '@/lib/tickets';
import { useConfirm } from '@/components/ui/confirm';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [type, setType] = useState<TicketType>('bug');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const create = useMutation({
    mutationFn: () =>
      createTicket(
        {
          type,
          priority,
          title: title.trim(),
          body: body.trim(),
          contextPath: window.location.pathname,
        },
        files,
      ),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      onClose();
      navigate(`/support/${r.ref}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 429) {
        toast('Trop de tickets ouverts récemment. Réessaie dans un moment.', 'error');
        return;
      }
      toast('Échec de l’envoi du ticket.', 'error');
    },
  });

  const valid = title.trim().length >= 3 && body.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Nouveau ticket</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !create.isPending) create.mutate();
          }}
        >
          <div>
            <span className="mb-1.5 block text-sm text-muted-foreground">De quoi s’agit-il ?</span>
            <div className="grid grid-cols-3 gap-2">
              {TICKET_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                    type === t.key ? 'border-primary/50 bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{TICKET_TYPES.find((t) => t.key === type)?.hint}</p>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Titre</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Impossible de valider une vente" autoFocus />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Explique en détail</span>
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ce que tu faisais, ce qui s’est passé, et ce que tu attendais. Si tu as eu un code d’erreur, colle-le ici."
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm text-muted-foreground">Priorité</span>
            <div className="grid grid-cols-3 gap-2">
              {TICKET_PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key)}
                  className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                    priority === p.key ? 'border-primary/50 bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{TICKET_PRIORITIES.find((p) => p.key === priority)?.hint}</p>
          </div>

          <AttachPicker files={files} setFiles={setFiles} />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketView({ refId }: { refId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const q = useQuery({ queryKey: ['my-ticket', refId], queryFn: () => getMyTicket(refId) });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['my-ticket', refId] });
    queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
  };
  const send = useMutation({
    mutationFn: () => replyToMyTicket(refId, reply.trim(), files),
    onSuccess: () => { setReply(''); setFiles([]); invalidate(); },
    onError: () => toast('Échec de l’envoi.', 'error'),
  });
  const close = useMutation({
    mutationFn: () => closeMyTicket(refId),
    onSuccess: invalidate,
    onError: () => toast('Échec.', 'error'),
  });
  const react = useMutation({
    mutationFn: (v: { messageId: number; emoji: string }) => reactToMyTicketMessage(refId, v.messageId, v.emoji),
    onSuccess: invalidate,
    onError: () => toast('Échec.', 'error'),
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (q.isError || !q.data) {
    return <EmptyState icon={LifeBuoy} title="Ticket introuvable" hint="Il a peut-être été supprimé." />;
  }

  const { ticket, messages } = q.data;
  const closed = ticket.status === 'closed';

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <button
        type="button"
        onClick={() => navigate('/support')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Mes tickets
      </button>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">#{ticket.ref}</span>
          <h1 className="text-base font-semibold">{ticket.title}</h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <TypeBadge type={ticket.type} />
          <span className="text-xs text-muted-foreground">ouvert le {fmtWhen(ticket.createdAt)}</span>
        </div>
      </div>

      <Thread messages={messages} meId={user ? Number(user.id) : null} onReact={closed ? undefined : (messageId, emoji) => react.mutate({ messageId, emoji })} />

      {closed ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
          Ce ticket est fermé. Ouvre un nouveau ticket si tu as besoin.
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
            className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Écris ta réponse…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <AttachPicker files={files} setFiles={setFiles} />
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={close.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Fermer ce ticket ?', message: 'Tu ne pourras plus écrire dedans. Un membre du staff pourra le rouvrir si besoin.', confirmLabel: 'Fermer le ticket', destructive: true })) close.mutate();
              }}
            >
              <X className="h-4 w-4" />
              Fermer le ticket
            </Button>
            <Button type="submit" className="ml-auto" disabled={!reply.trim() || send.isPending}>
              <Send className="h-4 w-4" />
              Envoyer
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Support() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['my-tickets'], queryFn: getMyTickets, enabled: !ref });

  if (ref) return <TicketView refId={ref} />;

  const list = q.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">
            Un bug, une question ou une idée ? Ouvre un ticket, le staff te répond ici.
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouveau ticket
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Aucun ticket"
          hint="Signale un bug, pose une question ou propose une amélioration — le staff te répond directement ici."
        />
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => navigate(`/support/${t.ref}`)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50"
            >
              <span className="font-mono text-xs text-muted-foreground">#{t.ref}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.priority} />
              <span className="text-xs text-muted-foreground">{fmtWhen(t.lastMessageAt ?? t.createdAt)}</span>
            </button>
          ))}
        </div>
      )}

      {open && <NewTicketModal onClose={() => setOpen(false)} />}
    </div>
  );
}
