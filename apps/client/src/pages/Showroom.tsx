import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getShowroom, type ShowroomVehicle } from '@/lib/concession';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

const STYLES = `
.sr-root{--g1:#10b981;--g2:#84cc16;--g3:#2dd4bf;--ink:#0b1a12;color:var(--ink);background:#eefbf3;}
.sr-aurora{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:
  radial-gradient(60% 50% at 12% 8%,rgba(16,185,129,.28),transparent 60%),
  radial-gradient(55% 45% at 92% 12%,rgba(132,204,22,.22),transparent 60%),
  radial-gradient(70% 60% at 50% 108%,rgba(45,212,191,.20),transparent 60%),
  linear-gradient(180deg,#f2fdf6,#e9fbf1 40%,#f4fdf8);}
.sr-blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;mix-blend-mode:multiply;}
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
.sr-tilt{transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .4s;transform-style:preserve-3d;will-change:transform;}
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
`;

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Showroom() {
  const { token } = useParams<{ token: string }>();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState<'all' | 'new' | 'used'>('all');
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
  const filtered = useMemo(
    () => vehicles.filter((v) => (type === 'all' || v.type === type) && (!cat || v.category === cat) && v.name.toLowerCase().includes(q.toLowerCase())),
    [vehicles, type, cat, q],
  );
  const grouped = useMemo(() => categories.map(([c]) => ({ cat: c, items: filtered.filter((v) => v.category === c) })).filter((g) => g.items.length), [categories, filtered]);
  const searching = q.trim().length > 0;

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
      />

      <div ref={catalogRef} className="relative z-10 mx-auto max-w-[1400px] px-5 pb-28 pt-10 sm:px-8">
        {filtered.length === 0 ? (
          <div className="grid place-items-center rounded-3xl border border-emerald-900/10 bg-white/50 py-24 text-emerald-900/50 backdrop-blur">
            Aucun véhicule ne correspond.
          </div>
        ) : searching || cat ? (
          <>
            <SectionTitle label={cat || 'Résultats'} count={filtered.length} />
            <Grid items={filtered} />
          </>
        ) : (
          grouped.map((g) => (
            <section key={g.cat} className="mb-16 scroll-mt-24" id={`cat-${g.cat}`}>
              <SectionTitle label={g.cat} count={g.items.length} />
              <Grid items={g.items} />
            </section>
          ))
        )}
      </div>

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
      <div className="flex items-center gap-3 pt-8">
        {company.logoUrl
          ? <img src={company.logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-emerald-900/10" />
          : <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 text-xl">🚗</div>}
        <div className="text-sm font-bold tracking-[0.28em] text-emerald-800">{company.name.toUpperCase()}</div>
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

function StickyNav({ q, setQ, type, setType, cat, setCat, categories, total }: {
  q: string; setQ: (v: string) => void; type: 'all' | 'new' | 'used'; setType: (v: 'all' | 'new' | 'used') => void;
  cat: string; setCat: (v: string) => void; categories: [string, number][]; total: number;
}) {
  return (
    <div className="sticky top-0 z-30 border-y border-emerald-900/10 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto max-w-[1400px] px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
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
        </div>
        <div className="sr-noscroll mt-3 flex gap-2 overflow-x-auto pb-1">
          <Pill active={!cat} onClick={() => setCat('')} label="Tout" n={total} />
          {categories.map(([c, n]) => <Pill key={c} active={cat === c} onClick={() => setCat(cat === c ? '' : c)} label={c} n={n} />)}
        </div>
      </div>
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

function Grid({ items }: { items: ShowroomVehicle[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((v) => <TiltCard key={v.id} v={v} />)}
    </div>
  );
}

function TiltCard({ v }: { v: ShowroomVehicle }) {
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
        className="sr-card sr-tilt group relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/70 p-4 shadow-[0_10px_40px_-12px_rgba(6,78,59,.18)] backdrop-blur transition-shadow hover:shadow-[0_30px_60px_-18px_rgba(16,185,129,.4)]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-lime-50">
          <div className="absolute inset-0 [background:radial-gradient(120%_80%_at_50%_120%,rgba(16,185,129,.18),transparent_60%)]" />
          {v.imageUrl
            ? <img src={v.imageUrl} alt={v.name} loading="lazy" decoding="async" className="sr-pop absolute inset-0 h-full w-full object-contain p-2" style={{ filter: 'drop-shadow(0 16px 20px rgba(6,78,59,.28))' }} />
            : <div className="grid h-full w-full place-items-center text-5xl text-emerald-300">🚘</div>}
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${v.type === 'used' ? 'bg-amber-400 text-amber-950' : 'bg-emerald-500 text-white'}`}>
            {v.type === 'used' ? 'Occasion' : 'Neuf'}
          </span>
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
