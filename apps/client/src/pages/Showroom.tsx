import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getShowroom, type ShowroomVehicle } from '@/lib/concession';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const PAGE = 24;

const STYLES = `
.sr-root{--g1:#10b981;--g2:#84cc16;--g3:#2dd4bf;--ink:#0b1a12;color:var(--ink);background:#eefbf3;}
.sr-aurora{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:
  radial-gradient(60% 50% at 12% 8%,rgba(16,185,129,.28),transparent 60%),
  radial-gradient(55% 45% at 92% 12%,rgba(132,204,22,.22),transparent 60%),
  radial-gradient(70% 60% at 50% 108%,rgba(45,212,191,.20),transparent 60%),
  linear-gradient(180deg,#f2fdf6,#e9fbf1 40%,#f4fdf8);}
.sr-blob{position:absolute;border-radius:50%;filter:blur(48px);opacity:.42;}
.sr-b1{width:46vw;height:46vw;left:-8vw;top:-10vw;background:radial-gradient(circle,#34d399,transparent 70%);animation:srDrift1 22s ease-in-out infinite;}
.sr-b2{width:38vw;height:38vw;right:-6vw;top:2vw;background:radial-gradient(circle,#a3e635,transparent 70%);animation:srDrift2 26s ease-in-out infinite;}
.sr-b3{width:52vw;height:52vw;left:20vw;bottom:-24vw;background:radial-gradient(circle,#2dd4bf,transparent 70%);animation:srDrift3 30s ease-in-out infinite;}
@keyframes srDrift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(6vw,4vw) scale(1.12)}}
@keyframes srDrift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-5vw,5vw) scale(1.15)}}
@keyframes srDrift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(4vw,-4vw) scale(1.1)}}
.sr-grid{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(rgba(6,78,59,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(6,78,59,.06) 1px,transparent 1px);
  background-size:44px 44px;mask-image:radial-gradient(120% 80% at 50% 0%,#000,transparent 75%);}
.sr-shine{background:linear-gradient(90deg,#065f46,#10b981 40%,#84cc16 70%,#065f46);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:srShine 6s linear infinite;}
@keyframes srShine{to{background-position:220% 0}}
.sr-float{animation:srFloat 6s ease-in-out infinite;}
@keyframes srFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.sr-bounce{animation:srBounce 1.8s ease-in-out infinite;}
@keyframes srBounce{0%,100%{transform:translateY(0);opacity:.7}50%{transform:translateY(8px);opacity:1}}
.sr-tilt{transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .4s;transform-style:preserve-3d;}
.sr-card:hover{will-change:transform;}
.sr-pop{transform:translateZ(46px);transition:transform .5s cubic-bezier(.2,.8,.2,1);}
.sr-gloss{position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .4s;background:radial-gradient(240px 240px at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.55),transparent 60%);}
.sr-card:hover .sr-gloss{opacity:1;}
.sr-card:hover .sr-pop{transform:translateZ(70px) scale(1.05);}
.sr-reveal{opacity:0;transform:translateY(46px);}
.sr-reveal.in{opacity:1;transform:none;transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1);}
.sr-cardw{content-visibility:auto;contain-intrinsic-size:auto 360px;}
.sr-fade{transition:opacity .6s ease;}
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
    } catch { /* ignore */ }
    return [{ id: 'l1', name: 'Ma wishlist', ids: [] }];
  });
  const [activeId, setActiveId] = useState<string>(() => lists[0]?.id ?? 'l1');

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(lists)); } catch { /* quota / private mode */ }
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
      className={`grid place-items-center rounded-full border backdrop-blur transition-all hover:scale-110 active:scale-95 ${big ? 'h-11 w-11' : 'h-9 w-9'} ${active ? 'border-rose-300 bg-rose-500/90 text-white shadow-lg shadow-rose-500/30' : 'border-emerald-900/10 bg-white/80 text-emerald-900/50 hover:text-rose-500'}`}
    >
      <Heart active={active} className={big ? 'h-5 w-5' : 'h-4 w-4'} />
    </button>
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
  const col = useCollections(token);
  const catalogRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['showroom', token],
    queryFn: () => getShowroom(token as string),
    enabled: !!token,
    retry: false,
  });

  const vehicles = useMemo(() => query.data?.vehicles ?? [], [query.data]);
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
      <div className="sr-root grid min-h-screen place-items-center">
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
      <div className="sr-root grid min-h-screen place-items-center px-6 text-center">
        <style>{STYLES}</style>
        <div className="sr-aurora" />
        <div className="relative z-10">
          <div className="text-3xl font-black tracking-tight text-emerald-950">Showroom introuvable</div>
          <p className="mt-2 text-sm text-emerald-800/70">Ce lien n'est plus valide ou la vitrine a été désactivée.</p>
        </div>
      </div>
    );
  }

  const company = query.data.company;
  const scrollToCatalog = () => catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
  const goPage = (p: number) => { setPage(Math.max(0, Math.min(p, pageCount - 1))); catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="sr-root relative min-h-screen overflow-x-clip">
      <style>{STYLES}</style>
      <div className="sr-aurora">
        <div className="sr-blob sr-b1" />
        <div className="sr-blob sr-b2" />
        <div className="sr-blob sr-b3" />
      </div>
      <div className="sr-grid" />

      <Hero company={company} featured={featured} count={vehicles.length} cats={categories.length} onExplore={scrollToCatalog} />

      <StickyNav
        q={q} setQ={setQ} type={type} setType={setType} cat={cat} setCat={setCat}
        categories={categories} total={vehicles.length}
        col={col} viewFavs={viewFavs} setViewFavs={setViewFavs}
      />

      <div ref={catalogRef} className="relative z-10 mx-auto max-w-[1400px] scroll-mt-28 px-5 pb-28 pt-10 sm:px-8">
        {viewFavs && filtered.length === 0 ? (
          <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-emerald-900/15 bg-white/60 py-24 text-center">
            <Heart active={false} className="h-10 w-10 text-emerald-400" />
            <div className="text-lg font-bold text-emerald-950">« {col.active?.name} » est vide</div>
            <div className="text-sm text-emerald-900/50">Ajoute des véhicules avec le cœur ♥ sur les cartes.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-3xl border border-emerald-900/10 bg-white/60 py-24 text-emerald-900/50">
            Aucun véhicule ne correspond.
          </div>
        ) : (
          <Catalog ordered={ordered} page={page} pageSize={PAGE} pageCount={pageCount} catCounts={catCounts}
            headerLabel={cat ? cat : viewFavs ? `♥ ${col.active?.name ?? 'Favoris'}` : null}
            perCatHeaders={!cat && !viewFavs}
            total={filtered.length}
            onOpen={setSelected} col={col} onPage={goPage} />
        )}
      </div>

      {selected && <VehicleModal v={selected} onClose={() => setSelected(null)} col={col} />}

      <footer className="relative z-10 border-t border-emerald-900/10 bg-white/40 py-10 text-center backdrop-blur">
        <div className="text-lg font-black tracking-tight text-emerald-950">{company.name}</div>
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
        <img src="/logo.png" alt="RP Compta" className="h-9 w-9 rounded-xl object-contain" />
        <div className="text-lg font-black tracking-tight text-emerald-950">RP Compta</div>
      </div>

      <div className="grid flex-1 items-center gap-6 lg:grid-cols-2">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-white/60 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-700 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Concession en ligne
          </div>
          <h1 className="text-[13vw] font-black leading-[0.92] tracking-tighter sm:text-6xl lg:text-7xl">
            <span className="block text-emerald-950">Roulez vers</span>
            <span className="sr-shine block">l'exception.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-emerald-900/60">
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
              <div className="absolute bottom-[14%] h-24 w-3/4 rounded-[50%] bg-emerald-500/25 blur-2xl" />
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
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-2xl border border-emerald-900/10 bg-white/70 px-5 py-2.5 text-center backdrop-blur">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{car.category} · vedette</div>
                  <div className="text-sm font-black text-emerald-950">{car.name}</div>
                  <div className="text-lg font-black text-emerald-600">{fmt(car.salePrice)} $</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <button onClick={onExplore} className="sr-bounce mx-auto mb-6 mt-2 grid h-10 w-10 place-items-center rounded-full border border-emerald-900/15 text-emerald-700" aria-label="Descendre">↓</button>
    </header>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="text-2xl font-black leading-none text-emerald-950">{fmt(n)}</div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700/60">{l}</div>
    </div>
  );
}

function StickyNav({ q, setQ, type, setType, cat, setCat, categories, total, col, viewFavs, setViewFavs }: {
  q: string; setQ: (v: string) => void; type: 'all' | 'new' | 'used'; setType: (v: 'all' | 'new' | 'used') => void;
  cat: string; setCat: (v: string) => void; categories: [string, number][]; total: number;
  col: Collections; viewFavs: boolean; setViewFavs: (v: boolean) => void;
}) {
  return (
    <div className="sticky top-0 z-30 border-y border-emerald-900/10 bg-white/90 backdrop-blur-md">
      <div className="mx-auto max-w-[1400px] px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-700/50">⌕</span>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un modèle…"
              className="h-11 w-full rounded-full border border-emerald-900/10 bg-white/80 pl-10 pr-4 text-sm text-emerald-950 outline-none transition-colors placeholder:text-emerald-900/35 focus:border-emerald-500/60"
            />
          </div>
          <div className="flex overflow-hidden rounded-full border border-emerald-900/10 bg-white/60">
            {(['all', 'new', 'used'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors ${type === t ? 'bg-emerald-500 text-white' : 'text-emerald-900/70 hover:bg-emerald-500/10'}`}>
                {t === 'all' ? 'Tout' : t === 'new' ? 'Neuf' : 'Occasion'}
              </button>
            ))}
          </div>
          <button onClick={() => setViewFavs(!viewFavs)}
            className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all ${viewFavs ? 'border-rose-300 bg-rose-500 text-white shadow-md shadow-rose-500/25' : 'border-emerald-900/10 bg-white/70 text-emerald-900/70 hover:border-rose-300 hover:text-rose-500'}`}>
            <Heart active={viewFavs} className="h-4 w-4" /> Favoris
            <span className={`rounded-full px-1.5 text-[10px] ${viewFavs ? 'bg-white/25' : 'bg-rose-500/10 text-rose-500'}`}>{col.totalFav}</span>
          </button>
          <CollectionsMenu col={col} onView={() => setViewFavs(true)} />
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
        className="inline-flex h-11 items-center gap-2 rounded-full border border-emerald-900/10 bg-white/70 px-4 text-sm font-semibold text-emerald-900/80 transition-colors hover:border-emerald-500/40">
        <span className="max-w-[140px] truncate">{col.active?.name ?? 'Mes listes'}</span>
        <span className="rounded-full bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700">{col.active?.ids.length ?? 0}</span>
        <span className="text-emerald-700/50">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setEditId(null); }} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-emerald-900/10 bg-white/95 p-2 shadow-xl backdrop-blur">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600">Mes listes</div>
            <div className="max-h-64 overflow-y-auto">
              {col.lists.map((l) => (
                <div key={l.id} className={`group flex items-center gap-1 rounded-xl px-1 ${col.activeId === l.id ? 'bg-emerald-500/10' : ''}`}>
                  {editId === l.id ? (
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null); }}
                      onBlur={commitEdit}
                      className="my-1 h-8 w-full rounded-lg border border-emerald-500/40 bg-white px-2 text-sm outline-none" />
                  ) : (
                    <>
                      <button onClick={() => { col.setActive(l.id); onView(); setOpen(false); }}
                        className="flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm">
                        <Heart active className={`h-3.5 w-3.5 ${col.activeId === l.id ? 'text-rose-500' : 'text-emerald-300'}`} />
                        <span className="flex-1 truncate font-medium text-emerald-950">{l.name}</span>
                        <span className="text-xs text-emerald-700/50">{l.ids.length}</span>
                      </button>
                      <button onClick={() => startEdit(l.id, l.name)} aria-label="Renommer" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-emerald-700/40 opacity-0 hover:bg-emerald-500/10 hover:text-emerald-700 group-hover:opacity-100">✎</button>
                      {col.lists.length > 1 && (
                        <button onClick={() => col.deleteList(l.id)} aria-label="Supprimer" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-emerald-700/40 opacity-0 hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100">×</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-emerald-900/10 pt-2">
              <input value={creating} onChange={(e) => setCreating(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                placeholder="Nouvelle liste…"
                className="h-9 flex-1 rounded-lg border border-emerald-900/10 bg-white px-2.5 text-sm outline-none focus:border-emerald-500/50" />
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all hover:scale-105 ${active ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25' : 'border-emerald-900/10 bg-white/70 text-emerald-900/70 hover:border-emerald-500/40'}`}>
      {label}
      <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/25' : 'bg-emerald-500/10 text-emerald-700'}`}>{n}</span>
    </button>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="sr-reveal mb-6 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-emerald-400 to-lime-400" />
        <h2 className="text-3xl font-black tracking-tight text-emerald-950 sm:text-4xl">{label}</h2>
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

function Catalog({ ordered, page, pageSize, pageCount, catCounts, headerLabel, perCatHeaders, total, onOpen, col, onPage }: {
  ordered: ShowroomVehicle[]; page: number; pageSize: number; pageCount: number; catCounts: Map<string, number>;
  headerLabel: string | null; perCatHeaders: boolean; total: number;
  onOpen: (v: ShowroomVehicle) => void; col: Collections; onPage: (p: number) => void;
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
    nodes.push(<TiltCard key={v.id} v={v} onOpen={onOpen} col={col} />);
  }
  return (
    <>
      {headerLabel && <SectionTitle label={headerLabel} count={total} />}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{nodes}</div>
      {pageCount > 1 && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Page précédente"
              className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-900 shadow-sm transition-all enabled:hover:bg-emerald-500/10 disabled:opacity-40">←</button>
            {pageWindow(page, pageCount).map((n, i) => n === -1
              ? <span key={`e${i}`} className="px-1 text-emerald-900/40">…</span>
              : <button key={n} type="button" onClick={() => onPage(n)}
                  className={`h-10 min-w-10 rounded-xl px-3 text-sm font-bold transition-all ${n === page ? 'bg-emerald-950 text-white shadow-md' : 'bg-white text-emerald-900/70 shadow-sm hover:bg-emerald-500/10'}`}>{n + 1}</button>)}
            <button type="button" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label="Page suivante"
              className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-900 shadow-sm transition-all enabled:hover:bg-emerald-500/10 disabled:opacity-40">→</button>
          </div>
          <div className="text-xs font-medium text-emerald-900/50">{start + 1}–{start + slice.length} sur {fmt(total)} · page {page + 1}/{pageCount}</div>
        </div>
      )}
    </>
  );
}

function TiltCard({ v, onOpen, col }: { v: ShowroomVehicle; onOpen: (v: ShowroomVehicle) => void; col: Collections }) {
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
        className="sr-card sr-tilt group relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white p-4 shadow-[0_10px_40px_-12px_rgba(6,78,59,.18)] outline-none transition-shadow hover:shadow-[0_30px_60px_-18px_rgba(16,185,129,.4)] focus-visible:ring-2 focus-visible:ring-emerald-500">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-lime-50">
          <div className="absolute inset-0 [background:radial-gradient(120%_80%_at_50%_120%,rgba(16,185,129,.18),transparent_60%)]" />
          {v.imageUrl
            ? <img src={v.imageUrl} alt={v.name} loading="lazy" decoding="async" className="sr-pop absolute inset-0 h-full w-full object-contain p-2" style={{ filter: 'drop-shadow(0 16px 20px rgba(6,78,59,.28))' }} />
            : <div className="grid h-full w-full place-items-center text-5xl text-emerald-300">🚘</div>}
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${v.type === 'used' ? 'bg-amber-400 text-amber-950' : 'bg-emerald-500 text-white'}`}>
            {v.type === 'used' ? 'Occasion' : 'Neuf'}
          </span>
          <div className="absolute right-3 top-3">
            <FavButton active={col.isInActive(v.id)} onToggle={() => col.toggleActive(v.id)} />
          </div>
          <div className="sr-gloss" />
        </div>
        <div className="relative mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{v.category}</div>
            <div className="truncate text-lg font-black text-emerald-950">{v.name}</div>
            {v.description && <p className="mt-0.5 line-clamp-1 text-xs text-emerald-900/50">{v.description}</p>}
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

function VehicleModal({ v, onClose, col }: { v: ShowroomVehicle; onClose: () => void; col: Collections }) {
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
      <div className="sr-mc relative max-h-[92vh] w-full max-w-4xl overflow-hidden overflow-y-auto rounded-[28px] border border-emerald-900/10 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Fermer"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-emerald-900/60 shadow backdrop-blur transition-colors hover:bg-white hover:text-emerald-950">✕</button>
        <div className="grid md:grid-cols-[1.15fr_1fr]">
          <div className="relative grid min-h-[300px] place-items-center bg-gradient-to-br from-emerald-50 via-lime-50 to-white p-8 [perspective:1200px]" onPointerMove={onMove} onPointerLeave={onLeave}>
            <div className="pointer-events-none absolute inset-0 [background:radial-gradient(80%_60%_at_50%_120%,rgba(16,185,129,.18),transparent_60%)]" />
            <span className={`absolute left-5 top-5 rounded-full px-3 py-1 text-xs font-bold ${v.type === 'used' ? 'bg-amber-400 text-amber-950' : 'bg-emerald-500 text-white'}`}>
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
            <h2 className="mt-1 text-3xl font-black leading-tight text-emerald-950">{v.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">{v.type === 'used' ? 'Occasion' : 'Neuf'}</span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">{v.category}</span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">Disponible</span>
            </div>
            {v.description && <p className="mt-4 text-sm leading-relaxed text-emerald-900/60">{v.description}</p>}

            <div className="mt-5 flex items-end justify-between rounded-2xl bg-emerald-950 px-5 py-4 text-white">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Prix</div>
                <div className="text-4xl font-black leading-none">{fmt(v.salePrice)} $</div>
              </div>
              <FavButton active={col.isInActive(v.id)} onToggle={() => col.toggleActive(v.id)} size="big" />
            </div>

            <div className="mt-6">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Ajouter à une liste</div>
              <div className="flex flex-wrap gap-2">
                {col.lists.map((l) => {
                  const inl = l.ids.includes(v.id);
                  return (
                    <button key={l.id} onClick={() => col.toggleIn(l.id, v.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${inl ? 'border-rose-300 bg-rose-500 text-white' : 'border-emerald-900/10 bg-white text-emerald-900/70 hover:border-rose-300'}`}>
                      <Heart active={inl} className="h-3.5 w-3.5" /> {l.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={creating} onChange={(e) => setCreating(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                  placeholder="Créer une liste (ex. Mes SUV de rêve)…"
                  className="h-9 flex-1 rounded-lg border border-emerald-900/10 bg-white px-2.5 text-sm outline-none focus:border-emerald-500/50" />
                <button onClick={create} disabled={!creating.trim()} className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-950 text-white disabled:opacity-40">＋</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
