import { useEffect, useRef } from 'react';
import { fmtDateTime, type Message } from '@/lib/messages';

export function MessageThread({
  messages,
  mineSide,
  emptyLabel = 'Aucun message pour le moment.',
}: {
  messages: Message[];
  mineSide: 'company' | 'irs';
  emptyLabel?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="grid place-items-center py-12 text-sm text-muted-foreground">{emptyLabel}</div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const mine = mineSide === 'irs' ? m.fromIrs : !m.fromIrs;
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] rounded-xl border px-3.5 py-2 ${
              mine ? 'border-primary/30 bg-primary/10' : 'bg-card'
            }`}>
              <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {m.fromIrs ? `IRS · ${m.senderName}` : m.senderName}
                </span>
                <span>{fmtDateTime(m.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm">{m.body}</div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

export function MessageComposer({
  onSend,
  pending,
  disabled,
}: {
  onSend: (body: string) => void;
  pending: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    const v = ref.current?.value.trim() ?? '';
    if (!v) return;
    onSend(v);
    if (ref.current) ref.current.value = '';
  };
  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        disabled={disabled}
        rows={2}
        placeholder={disabled ? 'Lecture seule' : 'Écrire un message…'}
        className="h-[44px] max-h-40 min-h-[44px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || disabled}
        className="h-9 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? 'Envoi…' : 'Envoyer'}
      </button>
    </div>
  );
}
