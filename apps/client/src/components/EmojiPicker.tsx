import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

interface EmojiEntry { id: string; name: string; keywords: string[]; native: string }
interface EmojiData { categories: { id: string; emojis: string[] }[]; map: Record<string, EmojiEntry> }

let cache: EmojiData | null = null;
let loading: Promise<EmojiData> | null = null;

async function loadEmojiData(): Promise<EmojiData> {
  if (cache) return cache;
  if (!loading) {
    loading = import('@emoji-mart/data').then((mod) => {
      const raw = mod.default as { categories: { id: string; emojis: string[] }[]; emojis: Record<string, { id: string; name: string; keywords: string[]; skins: { native: string }[] }> };
      const map: Record<string, EmojiEntry> = {};
      for (const [id, e] of Object.entries(raw.emojis)) {
        map[id] = { id, name: e.name, keywords: e.keywords ?? [], native: e.skins?.[0]?.native ?? '' };
      }
      cache = { categories: raw.categories, map };
      return cache;
    });
  }
  return loading;
}

const CAT_LABEL: Record<string, string> = {
  people: 'Émotes', nature: 'Nature', foods: 'Nourriture', activity: 'Activités',
  places: 'Voyages', objects: 'Objets', symbols: 'Symboles', flags: 'Drapeaux',
};

export function EmojiPicker({ onPick, onClose }: { onPick: (native: string) => void; onClose: () => void }) {
  const [data, setData] = useState<EmojiData | null>(cache);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { let alive = true; loadEmojiData().then((d) => { if (alive) setData(d); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!data || !q) return null;
    const out: EmojiEntry[] = [];
    for (const e of Object.values(data.map)) {
      if (e.name.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q))) out.push(e);
      if (out.length >= 90) break;
    }
    return out;
  }, [data, q]);

  return (
    <div ref={ref} className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border bg-popover shadow-xl">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un emoji…" className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>
      <div className="h-64 overflow-y-auto p-2">
        {!data ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">Chargement des emojis…</div>
        ) : results ? (
          results.length === 0 ? <div className="grid h-full place-items-center text-xs text-muted-foreground">Aucun emoji</div>
          : <div className="grid grid-cols-8 gap-0.5">{results.map((e) => <EmojiBtn key={e.id} e={e} onPick={onPick} />)}</div>
        ) : (
          data.categories.map((c) => (
            <div key={c.id} className="mb-2">
              <div className="px-1 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">{CAT_LABEL[c.id] ?? c.id}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {c.emojis.map((id) => { const e = data.map[id]; return e ? <EmojiBtn key={id} e={e} onPick={onPick} /> : null; })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmojiBtn({ e, onPick }: { e: EmojiEntry; onPick: (native: string) => void }) {
  return (
    <button type="button" title={e.name} onClick={() => onPick(e.native)} className="grid h-8 w-8 place-items-center rounded-md text-xl leading-none hover:bg-accent">
      {e.native}
    </button>
  );
}
