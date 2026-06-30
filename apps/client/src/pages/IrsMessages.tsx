import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { getAllMessages, sendIrsMessage, fmtDateTime, type Message } from '@/lib/messages';
import { getCompanies } from '@/lib/companies';
import { MessageThread, MessageComposer } from '@/components/MessageThread';
import { SearchInput } from '@/components/ui/filters';

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
  const [selectedName, setSelectedName] = useState<string>('');
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const filtered = useMemo<Thread[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.companyName.toLowerCase().includes(q) || (t.last.body ?? '').toLowerCase().includes(q),
    );
  }, [threads, search]);

  const activeThread = threads.find((t) => t.companyId === selected);
  const active: { companyId: number; companyName: string; messages: Message[] } | null = activeThread
    ? activeThread
    : selected
      ? { companyId: selected, companyName: selectedName || `#${selected}`, messages: [] }
      : null;

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
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Entreprises</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              title="Nouvelle conversation"
              aria-label="Nouvelle conversation"
              className="grid h-7 w-7 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher…"
              className="flex-1 min-w-[12rem]"
            />
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} resultat(s)
            </span>
          </div>
          <div className="max-h-[60vh] divide-y overflow-y-auto">
            {filtered.map((t) => (
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
            {threads.length > 0 && filtered.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Aucun resultat pour ces filtres.
              </div>
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
              Sélectionnez une entreprise (ou « + ») pour démarrer une conversation.
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (
        <CompanyPickerModal
          onClose={() => setPickerOpen(false)}
          onPick={(id, name) => {
            setSelected(id);
            setSelectedName(name);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CompanyPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (id: number, name: string) => void }) {
  const { data } = useQuery({ queryKey: ['companies'], queryFn: getCompanies });
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = (data ?? []).filter((c) => !term || c.name.toLowerCase().includes(term));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Nouvelle conversation</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Rechercher une entreprise…" className="w-full" />
        </div>
        <div className="max-h-[55vh] divide-y overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Aucune entreprise.</div>
          ) : (
            list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id, c.name)}
                className="block w-full px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
