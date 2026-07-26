import { useState } from 'react';
import { Bug, HelpCircle, Lightbulb, Lock, ImagePlus, X, SmilePlus } from 'lucide-react';
import { TICKET_TYPES, TICKET_PRIORITIES, TICKET_STATUSES } from '@rp-compta/shared';
import type { TicketType, TicketPriority, TicketStatus } from '@rp-compta/shared';
import type { TicketMessage } from '@/lib/tickets';
import { renderMarkdown } from '@/lib/discordMarkdown';
import { EmojiPicker } from '@/components/EmojiPicker';

const TYPE_LABEL = Object.fromEntries(TICKET_TYPES.map((t) => [t.key, t.label])) as Record<string, string>;
const PRIO_LABEL = Object.fromEntries(TICKET_PRIORITIES.map((p) => [p.key, p.label])) as Record<string, string>;
const STATUS_LABEL = Object.fromEntries(TICKET_STATUSES.map((s) => [s.key, s.label])) as Record<string, string>;

const TYPE_ICON = { bug: Bug, question: HelpCircle, suggestion: Lightbulb };
const PRIO_STYLE: Record<string, string> = {
  high: 'bg-destructive/15 text-destructive',
  normal: 'bg-amber-500/15 text-amber-300',
  low: 'bg-muted text-muted-foreground',
};
const STATUS_STYLE: Record<string, string> = {
  waiting_staff: 'bg-sky-500/15 text-sky-300',
  waiting_user: 'bg-amber-500/15 text-amber-300',
  resolved: 'bg-emerald-500/15 text-emerald-300',
  closed: 'bg-muted text-muted-foreground',
};

const chip = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium';

export function TypeBadge({ type }: { type: TicketType }) {
  const Icon = TYPE_ICON[type] ?? HelpCircle;
  return (
    <span className={`${chip} bg-muted text-muted-foreground`}>
      <Icon className="h-3 w-3" />
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <span className={`${chip} ${PRIO_STYLE[priority] ?? ''}`}>{PRIO_LABEL[priority] ?? priority}</span>;
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`${chip} ${STATUS_STYLE[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function fmtWhen(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function AttachPicker({
  files,
  setFiles,
  max = 3,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  max?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent">
        <ImagePlus className="h-4 w-4" />
        Capture d’écran
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            setFiles([...files, ...picked].slice(0, max));
            e.target.value = '';
          }}
        />
      </label>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
          <span className="max-w-32 truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => setFiles(files.filter((_, j) => j !== i))}
            aria-label={`Retirer ${f.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function Thread({
  messages,
  meId,
  onReact,
}: {
  messages: TicketMessage[];
  meId: number | null;
  onReact?: (messageId: number, emoji: string) => void;
}) {
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const mine = meId !== null && m.authorId === meId;
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-xl border p-3 ${
                m.internal
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : mine
                    ? 'border-primary/30 bg-primary/10'
                    : 'bg-card'
              }`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.authorName ?? 'Système'}</span>
                <span>{fmtWhen(m.createdAt)}</span>
                {m.internal && (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Lock className="h-3 w-3" />
                    note interne
                  </span>
                )}
              </div>
              <div className="mt-1">{renderMarkdown(m.body)}</div>
              {m.attachments?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title={a.name ?? 'capture'}>
                      <img
                        src={a.url}
                        alt={a.name ?? 'capture'}
                        className="h-24 w-24 rounded-md border object-cover transition-opacity hover:opacity-80"
                      />
                    </a>
                  ))}
                </div>
              )}
              {onReact && (
                <div className="relative mt-2 flex flex-wrap items-center gap-1">
                  {m.reactions?.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => onReact(m.id, r.emoji)}
                      title={r.mine ? 'Retirer ta réaction' : 'Réagir'}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${r.mine ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border bg-muted/50 text-muted-foreground hover:bg-accent'}`}
                    >
                      <span className="text-sm leading-none">{r.emoji}</span>
                      <span className="tabular-nums">{r.count}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                    title="Ajouter une réaction"
                    className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <SmilePlus className="h-3.5 w-3.5" />
                  </button>
                  {pickerFor === m.id && (
                    <EmojiPicker
                      onPick={(native) => { onReact(m.id, native); setPickerFor(null); }}
                      onClose={() => setPickerFor(null)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
