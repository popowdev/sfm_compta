import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getShowroom, type ShowroomVehicle } from '@/lib/concession';
import { statsFor } from '@/lib/gtaStats';

interface Compare { ids: number[]; has: (id: number) => boolean; toggle: (v: ShowroomVehicle) => void; clear: () => void }
const STAT_META: { key: 0 | 1 | 2 | 3; label: string }[] = [
  { key: 0, label: 'Vitesse' },
  { key: 1, label: 'Accélération' },
  { key: 2, label: 'Freinage' },
  { key: 3, label: 'Tenue de route' },
];

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const PAGE = 24;

const STYLES = `
.sr-root{--bg:#eefbf3;--srf:#ffffff;--srf2:#ecfdf3;--tx:#052e1a;--mut:#3f5c4c;--mut2:#6b8a78;--bd:rgba(6,78,59,.10);--track:rgba(6,78,59,.10);--aur:linear-gradient(180deg,#f2fdf6,#e9fbf1 45%,#f4fdf8);
  color:var(--tx);background:var(--bg);}
.sr-root[data-theme="dark"]{--bg:#07120d;--srf:#101d16;--srf2:#0c1712;--tx:#e9fcef;--mut:#9cc4ad;--mut2:#6f9583;--bd:rgba(170,225,195,.13);--track:rgba(180,235,205,.13);--aur:linear-gradient(180deg,#08150e,#06110c 45%,#081410);}
.sr-aurora{position:fixed;inset:0;z-index:0;pointer-events:none;background:
  radial-gradient(58% 48% at 12% 6%,rgba(16,185,129,.20),transparent 60%),
  radial-gradient(52% 42% at 92% 12%,rgba(132,204,22,.16),transparent 60%),
  radial-gradient(68% 58% at 50% 106%,rgba(45,212,191,.15),transparent 60%),
  var(--aur);}
.sr-glow{position:fixed;z-index:0;pointer-events:none;border-radius:50%;will-change:transform;contain:strict;}
.sr-g1{width:68vw;height:68vw;left:-12vw;top:-24vw;background:radial-gradient(circle,rgba(16,185,129,.16),transparent 60%);animation:srG1 26s ease-in-out infinite;}
.sr-g2{width:54vw;height:54vw;right:-14vw;top:6vw;background:radial-gradient(circle,rgba(132,204,22,.14),transparent 62%);animation:srG2 32s ease-in-out infinite;}
.sr-g3{width:60vw;height:60vw;left:24vw;bottom:-30vw;background:radial-gradient(circle,rgba(45,212,191,.12),transparent 62%);animation:srG3 38s ease-in-out infinite;}
@keyframes srG1{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(8vw,5vw,0) scale(1.12)}}
@keyframes srG2{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-7vw,4vw,0) scale(1.14)}}
@keyframes srG3{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(5vw,-5vw,0) scale(1.1)}}
.sr-shine{background:linear-gradient(90deg,#059669,#10b981 45%,#65a30d);-webkit-background-clip:text;background-clip:text;color:transparent;}
.sr-float{animation:srFloat 7s ease-in-out infinite;}
@keyframes srFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.sr-bounce{animation:srBounce 1.8s ease-in-out infinite;}
@keyframes srBounce{0%,100%{transform:translateY(0);opacity:.7}50%{transform:translateY(7px);opacity:1}}
.sr-tilt{transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .4s cubic-bezier(.2,.8,.2,1),box-shadow .35s;transform-style:preserve-3d;}
.sr-card:hover{will-change:transform;}
.sr-pop{transform:translateZ(0);transition:transform .4s cubic-bezier(.2,.8,.2,1);}
.sr-gloss{position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .3s;background:radial-gradient(220px 220px at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.5),transparent 60%);}
.sr-card:hover .sr-gloss{opacity:1;}
.sr-card:hover .sr-pop{transform:translateZ(0) scale(1.05);}
.sr-reveal{opacity:0;transform:translateY(28px);}
.sr-reveal.in{opacity:1;transform:none;transition:opacity .5s ease,transform .5s ease;}
.sr-fade{transition:opacity .5s ease;}
.sr-noscroll{scrollbar-width:none;}
.sr-noscroll::-webkit-scrollbar{display:none;}
.sr-card{cursor:pointer;}
.sr-mbd{animation:srFade .28s ease both;}
.sr-mc{animation:srPop .42s cubic-bezier(.2,.9,.3,1.15) both;}
@keyframes srFade{from{opacity:0}to{opacity:1}}
@keyframes srPop{from{opacity:0;transform:translateY(22px) scale(.96)}to{opacity:1;transform:none}}
`;

export interface FavList {
  id: string;
  name: string;
  ids: number[];
}
export interface Collections {
  lists: FavList[];
  activeId: string;
  active: FavList | null;
  totalFav: number;
  isInActive: (vid: number) => boolean;
  isInAny: (vid: number) => boolean;
  toggleActive: (vid: number) => void;
  toggleIn: (listId: string, vid: number) => void;
  setActive: (listId: string) => void;
  createList: (name: string) => string;
  renameList: (listId: string, name: string) => void;
  deleteList: (listId: string) => void;
}

function newId(existing: FavList[]): string {
  let n = existing.length + 1;
  let id = `l${n}`;
  const has = (x: string) => existing.some((l) => l.id === x);
  while (has(id)) { n += 1; id = `l${n}`; }
  return id;
}

function useCollections(token: string | undefined): Collections {
  const key = `showroom-collections-${token ?? 'default'}`;
  const [lists, setLists] = useState<FavList[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        const clean = parsed
          .filter((l): l is FavList => !!l && typeof (l as FavList).id === 'string' && typeof (l as FavList).name === 'string' && Array.isArray((l as FavList).ids))
          .map((l) => ({ id: l.id, name: l.name, ids: l.ids.filter((x): x is number => typeof x === 'number') }));
        if (clean.length) return clean;
      }
    } catch { }
    return [{ id: 'l1', name: 'Ma wishlist', ids: [] }];
  });
  const [activeId, setActiveId] = useState<string>(() => lists[0]?.id ?? 'l1');

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(lists)); } catch { }
  }, [lists, key]);
  useEffect(() => {
    if (!lists.some((l) => l.id === activeId)) setActiveId(lists[0]?.id ?? 'l1');
  }, [lists, activeId]);

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const totalFav = useMemo(() => new Set(lists.flatMap((l) => l.ids)).size, [lists]);

  const toggleIn = useCallback((listId: string, vid: number) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, ids: l.ids.includes(vid) ? l.ids.filter((x) => x !== vid) : [...l.ids, vid] } : l)));
  }, []);
  const toggleActive = useCallback((vid: number) => {
    setLists((prev) => {
      const target = prev.some((l) => l.id === activeId) ? activeId : prev[0]?.id;
      if (!target) return prev;
      return prev.map((l) => (l.id === target ? { ...l, ids: l.ids.includes(vid) ? l.ids.filter((x) => x !== vid) : [...l.ids, vid] } : l));
    });
  }, [activeId]);
  const createList = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 40) || 'Ma liste';
    let created = '';
    setLists((prev) => { const id = newId(prev); created = id; return [...prev, { id, name: trimmed, ids: [] }]; });
    return created;
  }, []);
  const renameList = useCallback((listId: string, name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name: trimmed } : l)));
  }, []);
  const deleteList = useCallback((listId: string) => {
    setLists((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== listId)));
  }, []);

  return {
    lists,
    activeId: active?.id ?? '',
    active,
    totalFav,
    isInActive: (vid) => !!active?.ids.includes(vid),
    isInAny: (vid) => lists.some((l) => l.ids.includes(vid)),
    toggleActive,
    toggleIn,
    setActive: setActiveId,
    createList,
    renameList,
    deleteList,
  };
}

function Heart({ active, className }: { active: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function FavButton({ active, onToggle, size = 'card' }: { active: boolean; onToggle: () => void; size?: 'card' | 'big' }) {
  const big = size === 'big';
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`grid place-items-center rounded-full border backdrop-blur transition-all hover:scale-110 active:scale-95 ${big ? 'h-11 w-11' : 'h-9 w-9'} ${active ? 'border-rose-300 bg-rose-500/90 text-white shadow-lg shadow-rose-500/30' : 'border-[var(--bd)] bg-[var(--srf)] text-[var(--mut2)] hover:text-rose-500'}`}
    >
      <Heart active={active} className={big ? 'h-5 w-5' : 'h-4 w-4'} />
    </button>
  );
}

function CompareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20V11M12 20V4M19 20v-7" />
    </svg>
  );
}

function CompareModal({ vehicles, onClose, cmp }: { vehicles: ShowroomVehicle[]; onClose: () => void; cmp: Compare }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const rows = vehicles.map((v) => ({ v, stats: statsFor(v.name) }));
  const bestOf = (i: 0 | 1 | 2 | 3) => Math.max(0, ...rows.map((r) => (r.stats ? r.stats[i] : 0)));
  const cheapest = Math.min(...vehicles.map((v) => v.salePrice));
  const multi = vehicles.length > 1;
  return (
    <div className="sr-mbd fixed inset-0 z-[70] grid place-items-center bg-emerald-950/45 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="sr-mc relative max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] border border-[var(--bd)] bg-[var(--srf)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--bd)] bg-[var(--srf)] px-6 py-4 backdrop-blur">
          <h2 className="text-xl font-black text-[var(--tx)]">Comparatif · {vehicles.length} véhicules</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--srf2)]0/10 text-[var(--mut)] hover:bg-[var(--srf2)]0/20">✕</button>
        </div>
        <div className="grid gap-4 p-6" style={{ gridTemplateColumns: `repeat(${vehicles.length}, minmax(0,1fr))` }}>
          {rows.map(({ v, stats }) => (
            <div key={v.id} className="rounded-2xl border border-[var(--bd)] bg-[var(--srf)] p-4">
              <div className="relative mb-3 aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br from-[var(--srf2)] to-[var(--srf2)]">
                {v.imageUrl ? <img src={v.imageUrl} alt="" className="h-full w-full object-contain p-1" /> : <div className="grid h-full w-full place-items-center text-4xl">🚘</div>}
                <button type="button" onClick={() => cmp.toggle(v)} aria-label="Retirer" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[var(--srf)] text-[var(--mut2)] backdrop-blur hover:text-rose-500">✕</button>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{v.category} · {v.type === 'used' ? 'Occasion' : 'Neuf'}</div>
              <div className="truncate text-base font-black text-[var(--tx)]">{v.name}</div>
              <div className={`mt-1 text-lg font-black ${v.salePrice === cheapest && multi ? 'text-emerald-600' : 'text-[var(--mut)]'}`}>{fmt(v.salePrice)} $</div>
              {v.salePrice === cheapest && multi && <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">le moins cher ★</div>}
              <div className="mt-4 space-y-2.5">
                {STAT_META.map((s) => {
                  const val = stats ? stats[s.key] : null;
                  const win = multi && val != null && val === bestOf(s.key) && bestOf(s.key) > 0;
                  return (
                    <div key={s.key}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--mut)]">{s.label}</span>
                        <span className={`font-bold ${win ? 'text-emerald-600' : 'text-[var(--mut)]'}`}>{val != null ? val : '—'}{win ? ' ★' : ''}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
                        <div className={`h-full rounded-full ${win ? 'bg-gradient-to-r from-emerald-400 to-lime-400' : 'bg-[var(--srf2)]0/60'}`} style={{ width: `${val ?? 0}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!stats && <div className="pt-1 text-[11px] text-[var(--mut2)]">Stats de perf indisponibles pour ce modèle.</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 pb-5 text-center text-[11px] text-[var(--mut2)]">Performances d'origine (stock, sans améliorations) · indices relatifs 0–100.</div>
      </div>
    </div>
  );
}

let revealIO: IntersectionObserver | null = null;
function revealObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!revealIO) {
    revealIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO?.unobserve(e.target); }
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
  }
  return revealIO;
}
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const io = revealObserver();
    if (!el || !io) return;
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return ref;
}

export default function Showroom() {
  const { token } = useParams<{ token: string }>();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState<'all' | 'new' | 'used'>('all');
  const [selected, setSelected] = useState<ShowroomVehicle | null>(null);
  const [viewFavs, setViewFavs] = useState(false);
  const [page, setPage] = useState(0);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('showroom-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  useEffect(() => { try { localStorage.setItem('showroom-theme', theme); } catch { } }, [theme]);
  const col = useCollections(token);
  const catalogRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['showroom', token],
    queryFn: () => getShowroom(token as string),
    enabled: !!token,
    retry: false,
  });

  const vehicles = useMemo(() => query.data?.vehicles ?? [], [query.data]);
  const cmp = useMemo<Compare>(() => ({
    ids: compareIds,
    has: (id) => compareIds.includes(id),
    toggle: (v) => setCompareIds((prev) => (prev.includes(v.id) ? prev.filter((x) => x !== v.id) : prev.length >= 4 ? prev : [...prev, v.id])),
    clear: () => setCompareIds([]),
  }), [compareIds]);
  const compareVehicles = useMemo(() => compareIds.map((id) => vehicles.find((v) => v.id === id)).filter((v): v is ShowroomVehicle => !!v), [compareIds, vehicles]);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vehicles) m.set(v.category, (m.get(v.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [vehicles]);
  const featured = useMemo(
    () => [...vehicles].filter((v) => v.imageUrl).sort((a, b) => b.salePrice - a.salePrice).slice(0, 6),
    [vehicles],
  );
  const filtered = useMemo(() => {
    const favIds = viewFavs ? (col.active?.ids ?? []) : null;
    return vehicles.filter((v) =>
      (!favIds || favIds.includes(v.id)) &&
      (type === 'all' || v.type === type) &&
      (!cat || v.category === cat) &&
      v.name.toLowerCase().includes(q.toLowerCase()));
  }, [vehicles, type, cat, q, viewFavs, col.active]);
  const catRank = useMemo(() => new Map(categories.map(([c], i) => [c, i])), [categories]);
  const ordered = useMemo(
    () => [...filtered].sort((a, b) => (catRank.get(a.category) ?? 99) - (catRank.get(b.category) ?? 99)),
    [filtered, catRank],
  );
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ordered) m.set(v.category, (m.get(v.category) ?? 0) + 1);
    return m;
  }, [ordered]);

  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE));
  useEffect(() => { setPage(0); }, [q, cat, type, viewFavs, col.active]);
  useEffect(() => { if (page > pageCount - 1) setPage(pageCount - 1); }, [page, pageCount]);

  if (query.isLoading) {
    return (
      <div className="sr-root grid min-h-screen place-items-center" data-theme={theme}>
        <style>{STYLES}</style>
        <div className="sr-aurora" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
          <div className="text-sm font-medium tracking-widest text-emerald-700">CHARGEMENT DU SHOWROOM…</div>
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="sr-root grid min-h-screen place-items-center px-6 text-center" data-theme={theme}>
        <style>{STYLES}</style>
        <div className="sr-aurora" />
        <div className="relative z-10">
          <div className="text-3xl font-black tracking-tight text-[var(--tx)]">Showroom introuvable</div>
          <p className="mt-2 text-sm text-emerald-800/70">Ce lien n'est plus valide ou la vitrine a été désactivée.</p>
        </div>
      </div>
    );
  }

  const company = query.data.company;
  const scrollToCatalog = () => catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
  const goPage = (p: number) => { setPage(Math.max(0, Math.min(p, pageCount - 1))); catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="sr-root relative min-h-screen overflow-x-clip" data-theme={theme}>
      <style>{STYLES}</style>
      <div className="sr-aurora" />
      <div className="sr-glow sr-g1" />
      <div className="sr-glow sr-g2" />
      <div className="sr-glow sr-g3" />

      <Hero company={company} featured={featured} count={vehicles.length} cats={categories.length} onExplore={scrollToCatalog} />

      <StickyNav
        q={q} setQ={setQ} type={type} setType={setType} cat={cat} setCat={setCat}
        categories={categories} total={vehicles.length}
        col={col} viewFavs={viewFavs} setViewFavs={setViewFavs}
        theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <div ref={catalogRef} className="relative z-10 mx-auto max-w-[1400px] scroll-mt-28 px-5 pb-28 pt-10 sm:px-8">
        {viewFavs && filtered.length === 0 ? (
          <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-[var(--bd)] bg-[var(--srf2)] py-24 text-center">
            <Heart active={false} className="h-10 w-10 text-emerald-400" />
            <div className="text-lg font-bold text-[var(--tx)]">« {col.active?.name} » est vide</div>
            <div className="text-sm text-[var(--mut2)]">Ajoute des véhicules avec le cœur ♥ sur les cartes.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-3xl border border-[var(--bd)] bg-[var(--srf2)] py-24 text-[var(--mut2)]">
            Aucun véhicule ne correspond.
          </div>
        ) : (
          <Catalog ordered={ordered} page={page} pageSize={PAGE} pageCount={pageCount} catCounts={catCounts}
            headerLabel={cat ? cat : viewFavs ? `♥ ${col.active?.name ?? 'Favoris'}` : null}
            perCatHeaders={!cat && !viewFavs}
            total={filtered.length}
            onOpen={setSelected} col={col} cmp={cmp} onPage={goPage} />
        )}
      </div>

      {compareVehicles.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="sr-mc flex items-center gap-3 rounded-2xl border border-[var(--bd)] bg-[var(--srf)] px-4 py-2.5 shadow-xl backdrop-blur">
            <div className="flex -space-x-2">
              {compareVehicles.map((v) => (
                <div key={v.id} className="grid h-9 w-12 place-items-center overflow-hidden rounded-md border border-white bg-[var(--srf2)]">
                  {v.imageUrl ? <img src={v.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">🚘</span>}
                </div>
              ))}
            </div>
            <span className="text-sm font-semibold text-[var(--tx)]">{compareVehicles.length}/4</span>
            <button type="button" onClick={() => setCompareOpen(true)} disabled={compareVehicles.length < 2}
              className="rounded-full bg-emerald-950 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">Comparer</button>
            <button type="button" onClick={() => cmp.clear()} className="text-sm text-[var(--mut2)] hover:text-emerald-900">Vider</button>
          </div>
        </div>
      )}
      {compareOpen && <CompareModal vehicles={compareVehicles} onClose={() => setCompareOpen(false)} cmp={cmp} />}

      {selected && <VehicleModal v={selected} onClose={() => setSelected(null)} col={col} cmp={cmp} />}

      <footer className="relative z-10 border-t border-[var(--bd)] bg-[var(--srf2)] py-10 text-center backdrop-blur">
        <div className="text-lg font-black tracking-tight text-[var(--tx)]">{company.name}</div>
        <div className="mt-1 text-xs font-medium tracking-[0.3em] text-emerald-700/60">SHOWROOM · CATALOGUE EN TEMPS RÉEL</div>
      </footer>
    </div>
  );
}

function Hero({ company, featured, count, cats, onExplore }: { company: { name: string; logoUrl: string | null }; featured: ShowroomVehicle[]; count: number; cats: number; onExplore: () => void }) {
  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const car = featured[idx % Math.max(1, featured.length)] ?? null;

  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setIdx((i) => i + 1), 4200);
    return () => clearInterval(t);
  }, [featured.length]);

  const onMove = (e: React.PointerEvent) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-py * 10}deg`);
    el.style.setProperty('--ry', `${px * 16}deg`);
  };
  const onLeave = () => {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <header className="relative z-10 mx-auto flex min-h-[92vh] max-w-[1400px] flex-col px-5 sm:px-8">
      <div className="flex items-center gap-2.5 pt-8">
                <div className="text-lg font-black tracking-tight text-[var(--tx)]">RP Compta</div>
      </div>

      <div className="grid flex-1 items-center gap-6 lg:grid-cols-2">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-[var(--srf2)] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-700 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--srf2)]0" /> Concession en ligne
          </div>
          <h1 className="text-[13vw] font-black leading-[0.92] tracking-tighter sm:text-6xl lg:text-7xl">
            <span className="block text-[var(--tx)]">Roulez vers</span>
            <span className="sr-shine block">l'exception.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-[var(--mut)]">
            {count} véhicules d'exception, {cats} univers. Une collection triée sur le volet — trouvez celui qui vous ressemble.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={onExplore} className="group inline-flex items-center gap-2 rounded-full bg-emerald-950 px-6 py-3.5 text-sm font-semibold text-emerald-50 shadow-lg shadow-emerald-900/20 transition-transform hover:scale-105">
              Explorer le catalogue
              <span className="transition-transform group-hover:translate-y-0.5">↓</span>
            </button>
            <div className="flex items-center gap-5 pl-2">
              <Stat n={count} l="véhicules" />
              <Stat n={cats} l="catégories" />
            </div>
          </div>
        </div>

        <div className="relative h-[46vh] min-h-[320px] [perspective:1400px]" onPointerMove={onMove} onPointerLeave={onLeave}>
          {car && (
            <div ref={stageRef} className="sr-tilt absolute inset-0 grid place-items-center">
              <div className="absolute bottom-[14%] h-24 w-3/4 rounded-[50%] bg-[var(--srf2)]0/25 blur-2xl" />
              <div className="sr-float relative w-full [transform-style:preserve-3d]">
                {featured.map((f, i) => (
                  <img
                    key={f.id}
                    src={f.imageUrl ?? ''}
                    alt={f.name}
                    className={`sr-fade absolute left-1/2 top-1/2 w-[86%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-2xl ${i === idx % featured.length ? 'opacity-100' : 'opacity-0'}`}
                    style={{ transform: 'translate(-50%,-50%) translateZ(60px)', filter: 'drop-shadow(0 30px 40px rgba(6,78,59,.35))' }}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                ))}
              </div>
              {car && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-2xl border border-[var(--bd)] bg-[var(--srf)] px-5 py-2.5 text-center backdrop-blur">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{car.category} · vedette</div>
                  <div className="text-sm font-black text-[var(--tx)]">{car.name}</div>
                  <div className="text-lg font-black text-emerald-600">{fmt(car.salePrice)} $</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <button onClick={onExplore} className="sr-bounce mx-auto mb-6 mt-2 grid h-10 w-10 place-items-center rounded-full border border-[var(--bd)] text-emerald-700" aria-label="Descendre">↓</button>
    </header>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="text-2xl font-black leading-none text-[var(--tx)]">{fmt(n)}</div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700/60">{l}</div>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label="Basculer clair/sombre"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--bd)] bg-[var(--srf)] text-[var(--mut)] transition-colors hover:text-emerald-500">
      {theme === 'dark'
        ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" /></svg>
        : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
    </button>
  );
}

function StickyNav({ q, setQ, type, setType, cat, setCat, categories, total, col, viewFavs, setViewFavs, theme, onToggleTheme }: {
  q: string; setQ: (v: string) => void; type: 'all' | 'new' | 'used'; setType: (v: 'all' | 'new' | 'used') => void;
  cat: string; setCat: (v: string) => void; categories: [string, number][]; total: number;
  col: Collections; viewFavs: boolean; setViewFavs: (v: boolean) => void;
  theme: 'light' | 'dark'; onToggleTheme: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 border-y border-[var(--bd)] bg-[var(--srf)] shadow-sm">
      <div className="mx-auto max-w-[1400px] px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-700/50">⌕</span>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un modèle…"
              className="h-11 w-full rounded-full border border-[var(--bd)] bg-[var(--srf)] pl-10 pr-4 text-sm text-[var(--tx)] outline-none transition-colors placeholder:text-[var(--mut2)] focus:border-emerald-500/60"
            />
          </div>
          <div className="flex overflow-hidden rounded-full border border-[var(--bd)] bg-[var(--srf2)]">
            {(['all', 'new', 'used'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors ${type === t ? 'bg-[var(--srf2)]0 text-white' : 'text-[var(--mut)] hover:bg-[var(--srf2)]0/10'}`}>
                {t === 'all' ? 'Tout' : t === 'new' ? 'Neuf' : 'Occasion'}
              </button>
            ))}
          </div>
          <button onClick={() => setViewFavs(!viewFavs)}
            className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all ${viewFavs ? 'border-rose-300 bg-rose-500 text-white shadow-md shadow-rose-500/25' : 'border-[var(--bd)] bg-[var(--srf)] text-[var(--mut)] hover:border-rose-300 hover:text-rose-500'}`}>
            <Heart active={viewFavs} className="h-4 w-4" /> Favoris
            <span className={`rounded-full px-1.5 text-[10px] ${viewFavs ? 'bg-[rgba(255,255,255,0.22)]' : 'bg-rose-500/10 text-rose-500'}`}>{col.totalFav}</span>
          </button>
          <CollectionsMenu col={col} onView={() => setViewFavs(true)} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill active={!cat} onClick={() => setCat('')} label="Tout" n={total} />
          {categories.map(([c, n]) => <Pill key={c} active={cat === c} onClick={() => setCat(cat === c ? '' : c)} label={c} n={n} />)}
        </div>
      </div>
    </div>
  );
}

function CollectionsMenu({ col, onView }: { col: Collections; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startEdit = (id: string, name: string) => { setEditId(id); setEditName(name); };
  const commitEdit = () => { if (editId) col.renameList(editId, editName); setEditId(null); setEditName(''); };
  const create = () => { const name = creating.trim(); if (!name) return; const id = col.createList(name); col.setActive(id); setCreating(''); };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--bd)] bg-[var(--srf)] px-4 text-sm font-semibold text-[var(--tx)] transition-colors hover:border-emerald-500/40">
        <span className="max-w-[140px] truncate">{col.active?.name ?? 'Mes listes'}</span>
        <span className="rounded-full bg-[var(--srf2)]0/10 px-1.5 text-[10px] text-emerald-700">{col.active?.ids.length ?? 0}</span>
        <span className="text-emerald-700/50">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setEditId(null); }} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-[var(--bd)] bg-[var(--srf)] p-2 shadow-xl backdrop-blur">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600">Mes listes</div>
            <div className="max-h-64 overflow-y-auto">
              {col.lists.map((l) => (
                <div key={l.id} className={`group flex items-center gap-1 rounded-xl px-1 ${col.activeId === l.id ? 'bg-[var(--srf2)]0/10' : ''}`}>
                  {editId === l.id ? (
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null); }}
                      onBlur={commitEdit}
                      className="my-1 h-8 w-full rounded-lg border border-emerald-500/40 bg-[var(--srf)] px-2 text-sm outline-none" />
                  ) : (
                    <>
                      <button onClick={() => { col.setActive(l.id); onView(); setOpen(false); }}
                        className="flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm">
                        <Heart active className={`h-3.5 w-3.5 ${col.activeId === l.id ? 'text-rose-500' : 'text-emerald-300'}`} />
                        <span className="flex-1 truncate font-medium text-[var(--tx)]">{l.name}</span>
                        <span className="text-xs text-emerald-700/50">{l.ids.length}</span>
                      </button>
                      <button onClick={() => startEdit(l.id, l.name)} aria-label="Renommer" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-emerald-700/40 opacity-0 hover:bg-[var(--srf2)]0/10 hover:text-emerald-700 group-hover:opacity-100">✎</button>
                      {col.lists.length > 1 && (
                        <button onClick={() => col.deleteList(l.id)} aria-label="Supprimer" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-emerald-700/40 opacity-0 hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100">×</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-[var(--bd)] pt-2">
              <input value={creating} onChange={(e) => setCreating(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                placeholder="Nouvelle liste…"
                className="h-9 flex-1 rounded-lg border border-[var(--bd)] bg-[var(--srf)] px-2.5 text-sm outline-none focus:border-emerald-500/50" />
              <button onClick={create} disabled={!creating.trim()}
                className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-950 text-white disabled:opacity-40">＋</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all hover:scale-105 ${active ? 'border-emerald-500 bg-[var(--srf2)]0 text-white shadow-md shadow-emerald-500/25' : 'border-[var(--bd)] bg-[var(--srf)] text-[var(--mut)] hover:border-emerald-500/40'}`}>
      {label}
      <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-[rgba(255,255,255,0.22)]' : 'bg-[var(--srf2)]0/10 text-emerald-700'}`}>{n}</span>
    </button>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="sr-reveal mb-6 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-emerald-400 to-lime-400" />
        <h2 className="text-3xl font-black tracking-tight text-[var(--tx)] sm:text-4xl">{label}</h2>
      </div>
      <div className="mb-1 text-sm font-semibold text-emerald-700/60">{count} modèle{count > 1 ? 's' : ''}</div>
    </div>
  );
}

function pageWindow(cur: number, count: number): number[] {
  const pages = new Set<number>([0, count - 1]);
  for (let i = cur - 1; i <= cur + 1; i += 1) if (i >= 0 && i < count) pages.add(i);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: number[] = [];
  let prev = -1;
  for (const p of sorted) { if (prev >= 0 && p - prev > 1) out.push(-1); out.push(p); prev = p; }
  return out;
}

function Catalog({ ordered, page, pageSize, pageCount, catCounts, headerLabel, perCatHeaders, total, onOpen, col, cmp, onPage }: {
  ordered: ShowroomVehicle[]; page: number; pageSize: number; pageCount: number; catCounts: Map<string, number>;
  headerLabel: string | null; perCatHeaders: boolean; total: number;
  onOpen: (v: ShowroomVehicle) => void; col: Collections; cmp: Compare; onPage: (p: number) => void;
}) {
  const start = page * pageSize;
  const slice = ordered.slice(start, start + pageSize);
  const nodes: React.ReactNode[] = [];
  let lastCat: string | null = null;
  for (const v of slice) {
    if (perCatHeaders && v.category !== lastCat) {
      lastCat = v.category;
      nodes.push(<div key={`h-${v.category}`} className="col-span-full"><SectionTitle label={v.category} count={catCounts.get(v.category) ?? 0} /></div>);
    }
    nodes.push(<TiltCard key={v.id} v={v} onOpen={onOpen} col={col} cmp={cmp} />);
  }
  return (
    <>
      {headerLabel && <SectionTitle label={headerLabel} count={total} />}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{nodes}</div>
      {pageCount > 1 && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Page précédente"
              className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--srf)] text-emerald-900 shadow-sm transition-all enabled:hover:bg-[var(--srf2)]0/10 disabled:opacity-40">←</button>
            {pageWindow(page, pageCount).map((n, i) => n === -1
              ? <span key={`e${i}`} className="px-1 text-[var(--mut2)]">…</span>
              : <button key={n} type="button" onClick={() => onPage(n)}
                  className={`h-10 min-w-10 rounded-xl px-3 text-sm font-bold transition-all ${n === page ? 'bg-emerald-950 text-white shadow-md' : 'bg-[var(--srf)] text-[var(--mut)] shadow-sm hover:bg-[var(--srf2)]0/10'}`}>{n + 1}</button>)}
            <button type="button" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label="Page suivante"
              className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--srf)] text-emerald-900 shadow-sm transition-all enabled:hover:bg-[var(--srf2)]0/10 disabled:opacity-40">→</button>
          </div>
          <div className="text-xs font-medium text-[var(--mut2)]">{start + 1}–{start + slice.length} sur {fmt(total)} · page {page + 1}/{pageCount}</div>
        </div>
      )}
    </>
  );
}

function TiltCard({ v, onOpen, col, cmp }: { v: ShowroomVehicle; onOpen: (v: ShowroomVehicle) => void; col: Collections; cmp: Compare }) {
  const wrapRef = useReveal<HTMLDivElement>();
  const tiltRef = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${px * 14}deg`);
    el.style.setProperty('--rx', `${-py * 12}deg`);
    el.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  };
  const onLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };

  return (
    <div ref={wrapRef} className="sr-reveal sr-cardw [perspective:1100px]">
      <div ref={tiltRef} onPointerMove={onMove} onPointerLeave={onLeave}
        role="button" tabIndex={0}
        onClick={() => onOpen(v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(v); } }}
        aria-label={`Voir ${v.name}`}
        className="sr-card sr-tilt group relative overflow-hidden rounded-3xl border border-[var(--bd)] bg-[var(--srf)] p-4 shadow-[0_10px_40px_-12px_rgba(6,78,59,.18)] outline-none transition-shadow hover:shadow-[0_30px_60px_-18px_rgba(16,185,129,.4)] focus-visible:ring-2 focus-visible:ring-emerald-500">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--srf2)] to-[var(--srf2)]">
          <div className="absolute inset-0 [background:radial-gradient(120%_80%_at_50%_120%,rgba(16,185,129,.18),transparent_60%)]" />
          {v.imageUrl
            ? <img src={v.imageUrl} alt={v.name} loading="lazy" decoding="async" className="sr-pop absolute inset-0 h-full w-full object-contain p-2" style={{ filter: 'drop-shadow(0 16px 20px rgba(6,78,59,.28))' }} />
            : <div className="grid h-full w-full place-items-center text-5xl text-emerald-300">🚘</div>}
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${v.type === 'used' ? 'bg-amber-400 text-amber-950' : 'bg-[var(--srf2)]0 text-white'}`}>
            {v.type === 'used' ? 'Occasion' : 'Neuf'}
          </span>
          <div className="absolute right-3 top-3 flex gap-1.5">
            <button type="button" aria-pressed={cmp.has(v.id)} aria-label="Comparer"
              onClick={(e) => { e.stopPropagation(); cmp.toggle(v); }}
              className={`grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition-all hover:scale-110 ${cmp.has(v.id) ? 'border-emerald-300 bg-[var(--srf2)]0 text-white shadow-lg shadow-emerald-500/30' : 'border-[var(--bd)] bg-[var(--srf)] text-[var(--mut2)] hover:text-emerald-600'}`}>
              <CompareIcon className="h-4 w-4" />
            </button>
            <FavButton active={col.isInActive(v.id)} onToggle={() => col.toggleActive(v.id)} />
          </div>
          <div className="sr-gloss" />
        </div>
        <div className="relative mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{v.category}</div>
            <div className="truncate text-lg font-black text-[var(--tx)]">{v.name}</div>
            {v.description && <p className="mt-0.5 line-clamp-1 text-xs text-[var(--mut2)]">{v.description}</p>}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-black leading-none text-emerald-600">{fmt(v.salePrice)}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/50">dollars</div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-4 bottom-3 flex translate-y-3 items-center justify-center gap-1.5 rounded-full bg-emerald-950 py-2 text-xs font-semibold text-emerald-50 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          Voir le véhicule →
        </div>
      </div>
    </div>
  );
}

function VehicleModal({ v, onClose, col, cmp }: { v: ShowroomVehicle; onClose: () => void; col: Collections; cmp: Compare }) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const onMove = (e: React.PointerEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${px * 12}deg`);
    el.style.setProperty('--rx', `${-py * 10}deg`);
  };
  const onLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };
  const create = () => {
    const name = creating.trim();
    if (!name) return;
    const id = col.createList(name);
    col.toggleIn(id, v.id);
    setCreating('');
  };

  return (
    <div className="sr-mbd fixed inset-0 z-[60] grid place-items-center bg-emerald-950/40 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="sr-mc relative max-h-[92vh] w-full max-w-4xl overflow-hidden overflow-y-auto rounded-[28px] border border-[var(--bd)] bg-[var(--srf)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Fermer"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-[var(--srf)] text-[var(--mut)] shadow backdrop-blur transition-colors hover:bg-[var(--srf)] hover:text-[var(--tx)]">✕</button>
        <div className="grid md:grid-cols-[1.15fr_1fr]">
          <div className="relative grid min-h-[300px] place-items-center bg-gradient-to-br from-[var(--srf2)] via-[var(--srf2)] to-[var(--srf)] p-8 [perspective:1200px]" onPointerMove={onMove} onPointerLeave={onLeave}>
            <div className="pointer-events-none absolute inset-0 [background:radial-gradient(80%_60%_at_50%_120%,rgba(16,185,129,.18),transparent_60%)]" />
            <span className={`absolute left-5 top-5 rounded-full px-3 py-1 text-xs font-bold ${v.type === 'used' ? 'bg-amber-400 text-amber-950' : 'bg-[var(--srf2)]0 text-white'}`}>
              {v.type === 'used' ? 'Occasion' : 'Neuf'}
            </span>
            <div ref={tiltRef} className="sr-tilt grid h-full w-full place-items-center">
              {v.imageUrl
                ? <img src={v.imageUrl} alt={v.name} className="sr-float max-h-[46vh] w-full object-contain" style={{ filter: 'drop-shadow(0 26px 34px rgba(6,78,59,.32))' }} />
                : <div className="text-7xl text-emerald-300">🚘</div>}
            </div>
          </div>

          <div className="flex flex-col p-7">
            <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">{v.category}</div>
            <h2 className="mt-1 text-3xl font-black leading-tight text-[var(--tx)]">{v.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--srf2)]0/10 px-3 py-1 text-xs font-semibold text-emerald-700">{v.type === 'used' ? 'Occasion' : 'Neuf'}</span>
              <span className="rounded-full bg-[var(--srf2)]0/10 px-3 py-1 text-xs font-semibold text-emerald-700">{v.category}</span>
              <span className="rounded-full bg-[var(--srf2)]0/10 px-3 py-1 text-xs font-semibold text-emerald-700">Disponible</span>
            </div>
            {v.description && <p className="mt-4 text-sm leading-relaxed text-[var(--mut)]">{v.description}</p>}

            {(() => {
              const st = statsFor(v.name);
              return (
                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Performances d'origine</div>
                  {st ? (
                    <div className="space-y-2">
                      {STAT_META.map((s) => (
                        <div key={s.key}>
                          <div className="mb-0.5 flex items-center justify-between text-[11px]">
                            <span className="font-medium text-[var(--mut)]">{s.label}</span>
                            <span className="font-bold text-[var(--mut)]">{st[s.key]}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-400" style={{ width: `${st[s.key]}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--bd)] px-3 py-2 text-[11px] text-[var(--mut2)]">Stats de perf indisponibles pour ce modèle.</div>
                  )}
                </div>
              );
            })()}

            <div className="mt-5 flex items-end justify-between rounded-2xl bg-emerald-950 px-5 py-4 text-white">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Prix</div>
                <div className="text-4xl font-black leading-none">{fmt(v.salePrice)} $</div>
              </div>
              <FavButton active={col.isInActive(v.id)} onToggle={() => col.toggleActive(v.id)} size="big" />
            </div>

            <button type="button" onClick={() => cmp.toggle(v)}
              className={`mt-3 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${cmp.has(v.id) ? 'border-emerald-500 bg-[var(--srf2)]0 text-white' : 'border-[var(--bd)] bg-[var(--srf)] text-[var(--mut)] hover:border-emerald-500/50'}`}>
              <CompareIcon className="h-4 w-4" /> {cmp.has(v.id) ? 'Dans le comparatif ✓' : 'Ajouter au comparatif'}
            </button>

            <div className="mt-6">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Ajouter à une liste</div>
              <div className="flex flex-wrap gap-2">
                {col.lists.map((l) => {
                  const inl = l.ids.includes(v.id);
                  return (
                    <button key={l.id} onClick={() => col.toggleIn(l.id, v.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${inl ? 'border-rose-300 bg-rose-500 text-white' : 'border-[var(--bd)] bg-[var(--srf)] text-[var(--mut)] hover:border-rose-300'}`}>
                      <Heart active={inl} className="h-3.5 w-3.5" /> {l.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={creating} onChange={(e) => setCreating(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                  placeholder="Créer une liste (ex. Mes SUV de rêve)…"
                  className="h-9 flex-1 rounded-lg border border-[var(--bd)] bg-[var(--srf)] px-2.5 text-sm outline-none focus:border-emerald-500/50" />
                <button onClick={create} disabled={!creating.trim()} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-950 text-white disabled:opacity-40">＋</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
