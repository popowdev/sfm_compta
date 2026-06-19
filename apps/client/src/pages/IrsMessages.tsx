import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllMessages, sendIrsMessage, fmtDateTime, type Message } from '@/lib/messages';
import { MessageThread, MessageComposer } from '@/components/MessageThread';

interface Thread {
  companyId: number;
  companyName: string;
  messages: Message[];
  last: Message;
}

export default function IrsMessages() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['irs-messages'], queryFn: getAllMessages });
  const [selected, setSelected] = useState<number | null>(null);

  const threads = useMemo<Thread[]>(() => {
    const byCompany = new Map<number, Thread>();
    for (const m of data ?? []) {
      let t = byCompany.get(m.companyId);
      if (!t) {
        t = { companyId: m.companyId, companyName: m.companyName ?? `#${m.companyId}`, messages: [], last: m };
        byCompany.set(m.companyId, t);
      }
      t.messages.push(m);
      t.last = m;
    }
    return [...byCompany.values()].sort(
      (a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime(),
    );
  }, [data]);

  const active = threads.find((t) => t.companyId === selected) ?? null;

  const send = useMutation({
    mutationFn: (body: string) => sendIrsMessage(selected!, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['irs-messages'] }),
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Messagerie</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conversations avec les entreprises du serveur.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[300px_1fr]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Entreprises</div>
          <div className="max-h-[60vh] divide-y overflow-y-auto">
            {threads.map((t) => (
              <button
                key={t.companyId}
                type="button"
                onClick={() => setSelected(t.companyId)}
                className={`block w-full px-4 py-3 text-left transition-colors hover:bg-accent ${
                  t.companyId === selected ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.companyName}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {fmtDateTime(t.last.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t.last.fromIrs ? 'IRS : ' : ''}
                  {t.last.body}
                </div>
              </button>
            ))}
            {threads.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground">Aucune conversation.</div>
            )}
          </div>
        </div>

        <div className="flex min-h-[60vh] flex-col rounded-xl border bg-card">
          {active ? (
            <>
              <div className="border-b px-4 py-3 text-sm font-semibold">{active.companyName}</div>
              <div className="flex-1 overflow-y-auto p-4">
                <MessageThread key={active.companyId} messages={active.messages} mineSide="irs" />
              </div>
              <div className="border-t p-3">
                <MessageComposer
                  key={active.companyId}
                  onSend={(b) => send.mutate(b)}
                  pending={send.isPending}
                />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              Sélectionnez une entreprise pour voir la conversation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
