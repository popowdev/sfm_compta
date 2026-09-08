import { useEffect, useState } from 'react';
import { useCompany } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Newspaper, Plus, Trash2, Coins, Heart, Video, FileText, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { frDay, mondayOf, weekRange } from '@/lib/bizWeek';
import { getWzn, addWznArticle, patchWznArticle, setWznActive, deleteWznArticle, type WznArticle, type WznType } from '@/lib/wzn';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtInt(n)} $`;

function shiftWeek(monday: string, n: number): string {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export default function Wzn() {
  const { companyId, isLoading } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [week, setWeek] = useState(() => mondayOf());
  const [modal, setModal] = useState(false);

  const q = useQuery({ queryKey: ['wzn', companyId, week], queryFn: () => getWzn(companyId, week), enabled: !!companyId });
  const inv = () => queryClient.invalidateQueries({ queryKey: ['wzn', companyId] });

  const toggle = useMutation({
    mutationFn: (v: { id: number; active: boolean }) => setWznActive(companyId, v.id, v.active),
    onSuccess: inv,
    onError: () => toast('Échec.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteWznArticle(companyId, id),
    onSuccess: () => { inv(); toast('Article supprimé.', 'success'); },
    onError: () => toast('Échec.', 'error'),
  });

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={Newspaper} title="Articles de presse" hint="Module indisponible." />;

  const { articles, total, config, canWrite, canManage } = q.data;
  const actifs = articles.filter((a) => a.counted);
  const likesTotal = actifs.reduce((s, a) => s + a.likes, 0);
  const range = weekRange(new Date(`${week}T12:00:00Z`));
  const thisWeek = mondayOf();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Coins} label="Recette de la semaine" value={money(total)} sub={`${actifs.length} article${actifs.length > 1 ? 's' : ''} payé${actifs.length > 1 ? 's' : ''}`} accent="text-emerald-400" />
        <Kpi icon={Newspaper} label="Articles au total" value={String(articles.length)} sub="tous statuts confondus" accent="text-primary" />
        <Kpi icon={Heart} label="Likes comptés" value={fmtInt(likesTotal)} sub={`${money(config.priceLike)} le like`} accent="text-rose-400" />
        <Kpi icon={FileText} label="Tarifs" value={`${fmtInt(config.priceVideo)} / ${fmtInt(config.priceEcrit)} $`} sub={`vidéo / écrit · ${config.weeks} semaines`} accent="text-sky-400" />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="Semaine précédente"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-44 text-center text-sm">
              <div className="font-semibold">{frDay(range.from)} → {frDay(range.to)}</div>
              <div className="text-xs text-muted-foreground">{week === thisWeek ? 'semaine en cours' : 'autre semaine'}</div>
            </div>
            <Button variant="outline" onClick={() => setWeek(shiftWeek(week, 1))} aria-label="Semaine suivante"><ChevronRight className="h-4 w-4" /></Button>
            {week !== thisWeek && <Button variant="outline" onClick={() => setWeek(thisWeek)}>Revenir à cette semaine</Button>}
          </div>
          {canWrite && <Button onClick={() => setModal(true)}><Plus className="h-4 w-4" />Nouvel article</Button>}
        </div>

        {articles.length === 0 ? (
          <EmptyState icon={Newspaper} title="Aucun article" hint="Ajoute un article pour qu'il rapporte chaque semaine." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-semibold">Article</th>
                  <th className="py-2 text-left font-semibold">Type</th>
                  <th className="py-2 text-right font-semibold">Likes</th>
                  <th className="py-2 text-center font-semibold">Diffusion</th>
                  <th className="py-2 text-right font-semibold">Cette semaine</th>
                  {canManage && <th className="py-2 text-center font-semibold">Actif</th>}
                  {canWrite && <th className="py-2 text-right font-semibold"></th>}
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id} className={`border-b last:border-b-0 ${a.counted ? '' : 'opacity-55'}`}>
                    <td className="py-2 font-medium">{a.title}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {a.type === 'video' ? <Video className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        {a.type === 'video' ? 'Vidéo' : 'Écrit'} · {money(a.base)}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {canWrite ? <LikesCell companyId={companyId} article={a} onSaved={inv} /> : <span>{fmtInt(a.likes)}</span>}
                    </td>
                    <td className="py-2 text-center text-xs text-muted-foreground">
                      {a.weekIndex < 1 ? `démarre le ${frDay(a.startWeek)}`
                        : a.weekIndex > a.weeks ? `terminée le ${frDay(a.endWeek)}`
                        : `semaine ${a.weekIndex} / ${a.weeks}`}
                    </td>
                    <td className={`py-2 text-right font-semibold ${a.counted ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {a.counted ? money(a.amount) : '—'}
                    </td>
                    {canManage && (
                      <td className="py-2 text-center">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={a.active}
                          disabled={toggle.isPending}
                          onChange={(e) => toggle.mutate({ id: a.id, active: e.target.checked })} />
                      </td>
                    )}
                    {canWrite && (
                      <td className="py-2 text-right">
                        <button type="button" className="text-muted-foreground hover:text-destructive"
                          onClick={async () => { if (await confirm({ title: 'Supprimer cet article ?', message: a.title, destructive: true })) remove.mutate(a.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-2" colSpan={4}>Recette de la semaine</td>
                  <td className="py-2 text-right text-emerald-400">{money(total)}</td>
                  {canManage && <td />}
                  {canWrite && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Un article rapporte son montant de base plus ses likes, chaque semaine, pendant {config.weeks} semaines à partir du lundi qui suit son ajout.
          Le nombre de likes se met à jour à tout moment : la semaine en cours est recalculée aussitôt.
        </p>
      </div>

      {modal && <ArticleModal companyId={companyId} onClose={() => setModal(false)} onSaved={() => { inv(); toast('Article ajouté.', 'success'); }} />}
    </div>
  );
}

function LikesCell({ companyId, article, onSaved }: { companyId: number; article: WznArticle; onSaved: () => void }) {
  const [v, setV] = useState(String(article.likes));
  const toast = useToast();
  useEffect(() => { setV(String(article.likes)); }, [article.likes]);
  const save = useMutation({
    mutationFn: (likes: number) => patchWznArticle(companyId, article.id, { likes }),
    onSuccess: onSaved,
    onError: () => { setV(String(article.likes)); toast('Échec.', 'error'); },
  });
  const commit = () => {
    const n = Math.max(0, Math.round(Number(v) || 0));
    if (n !== article.likes) save.mutate(n);
    else setV(String(article.likes));
  };
  return (
    <input type="number" min="0" step="1" value={v} disabled={save.isPending}
      className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm outline-none focus:ring-1 focus:ring-ring"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function ArticleModal({ companyId, onClose, onSaved }: { companyId: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WznType>('ecrit');
  const [likes, setLikes] = useState('0');
  const [startWeek, setStartWeek] = useState(() => shiftWeek(mondayOf(), 1));
  const [notes, setNotes] = useState('');
  const valid = title.trim().length > 0;
  const save = useMutation({
    mutationFn: () => addWznArticle(companyId, {
      title: title.trim(),
      type,
      likes: Math.max(0, Math.round(Number(likes) || 0)),
      startWeek,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Nouvel article</h2>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Titre de l'article *</span>
            <input className={inputCls} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Braquage du Fleeca de Vinewood" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Type</span>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as WznType)}>
                <option value="ecrit">Écrit</option>
                <option value="video">Vidéo</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Likes (modifiable ensuite)</span>
              <input type="number" min="0" step="1" className={inputCls} value={likes} onChange={(e) => setLikes(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Première semaine payée</span>
            <input type="date" className={inputCls} value={startWeek}
              onChange={(e) => setStartWeek(e.target.value ? mondayOf(new Date(`${e.target.value}T12:00:00Z`)) : startWeek)} />
            <span className="mt-1 block text-[11px] text-muted-foreground">Ramené au lundi de la semaine choisie. Par défaut, le lundi qui suit.</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Note (optionnel)</span>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid || save.isPending}>Enregistrer</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: typeof Newspaper; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className={`text-xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
