import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getShowroom, type ShowroomVehicle } from '@/lib/concession';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

export default function Showroom() {
  const { token } = useParams<{ token: string }>();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState<'all' | 'new' | 'used'>('all');

  const query = useQuery({
    queryKey: ['showroom', token],
    queryFn: () => getShowroom(token as string),
    enabled: !!token,
    retry: false,
  });

  const vehicles = query.data?.vehicles ?? [];
  const categories = useMemo(() => [...new Set(vehicles.map((v) => v.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [vehicles]);
  const rows = vehicles.filter((v) =>
    (type === 'all' || v.type === type) &&
    (!cat || v.category === cat) &&
    v.name.toLowerCase().includes(q.toLowerCase()),
  );

  if (query.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-400">
        <div className="animate-pulse text-sm">Chargement de la vitrine…</div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-center text-zinc-400">
        <div>
          <div className="text-2xl font-bold text-zinc-100">Vitrine introuvable</div>
          <p className="mt-2 text-sm">Ce lien n'est plus valide ou la vitrine a été désactivée.</p>
        </div>
      </div>
    );
  }

  const company = query.data.company;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-gradient-to-b from-emerald-500/10 to-transparent" />

      <header className="relative border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-8">
          {company.logoUrl
            ? <img src={company.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/10" />
            : <div className="grid h-14 w-14 place-items-center rounded-xl bg-emerald-500/15 text-2xl">🚗</div>}
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Concession automobile</div>
            <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un modèle…"
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/50"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 outline-none focus:border-emerald-500/50">
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
          </select>
          <div className="flex overflow-hidden rounded-xl border border-white/10">
            {(['all', 'new', 'used'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${type === t ? 'bg-emerald-500 text-zinc-950' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
                {t === 'all' ? 'Tout' : t === 'new' ? 'Neuf' : 'Occasion'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 text-sm text-zinc-500">{rows.length} véhicule{rows.length > 1 ? 's' : ''}</div>

        {rows.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-white/10 bg-white/[0.02] py-20 text-sm text-zinc-500">Aucun véhicule ne correspond.</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((v) => <VehicleCard key={v.id} v={v} />)}
          </div>
        )}
      </div>

      <footer className="relative mt-8 border-t border-white/10 py-8 text-center text-xs text-zinc-600">
        Catalogue en temps réel · {company.name}
      </footer>
    </div>
  );
}

function VehicleCard({ v }: { v: ShowroomVehicle }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-emerald-500/40">
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
        {v.imageUrl
          ? <img src={v.imageUrl} alt={v.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="grid h-full w-full place-items-center text-5xl text-zinc-700">🚘</div>}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold ${v.type === 'used' ? 'bg-amber-400 text-zinc-950' : 'bg-emerald-400 text-zinc-950'}`}>
          {v.type === 'used' ? 'Occasion' : 'Neuf'}
        </span>
      </div>
      <div className="p-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{v.category}</div>
        <div className="mt-0.5 truncate text-lg font-semibold">{v.name}</div>
        {v.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{v.description}</p>}
        <div className="mt-3 flex items-end justify-between">
          <div className="text-2xl font-bold text-emerald-400">{fmt(v.salePrice)} $</div>
        </div>
      </div>
    </div>
  );
}
