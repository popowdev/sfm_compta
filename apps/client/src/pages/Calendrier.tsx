import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getCalendar,
  getCalendarEntities,
  createEvent,
  deleteEvent,
  type CalEvent,
} from '@/lib/calendar';

const HOUR_PX = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ['LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.', 'DIM.'];
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const OWNER_STYLE: Record<string, string> = {
  company: 'border-sky-500/40 bg-sky-500/15 text-sky-100',
  association: 'border-violet-500/40 bg-violet-500/15 text-violet-100',
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dtStr = (d: Date) => `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const parseDt = (s: string) => new Date(s.replace(' ', 'T'));
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtTime(s: string) {
  return s.slice(11, 16);
}

function segmentForDay(ev: CalEvent, dayStart: Date) {
  const dayEnd = addDays(dayStart, 1);
  const s = parseDt(ev.startAt);
  const e = parseDt(ev.endAt);
  if (e <= dayStart || s >= dayEnd) return null;
  const segStart = s < dayStart ? dayStart : s;
  const segEnd = e > dayEnd ? dayEnd : e;
  const top = ((segStart.getTime() - dayStart.getTime()) / 3_600_000) * HOUR_PX;
  const height = Math.max(24, ((segEnd.getTime() - segStart.getTime()) / 3_600_000) * HOUR_PX);
  return { top, height };
}

export default function Calendrier() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<'semaine' | 'jour' | 'liste'>('semaine');
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(anchor);
  const rangeFrom = dtStr(weekStart);
  const rangeTo = dtStr(addDays(weekStart, 7));

  const q = useQuery({
    queryKey: ['calendar', rangeFrom, rangeTo],
    queryFn: () => getCalendar(rangeFrom, rangeTo),
  });
  const entitiesQ = useQuery({ queryKey: ['calendar-entities'], queryFn: getCalendarEntities });
  const events = q.data?.events ?? [];
  const entities = entitiesQ.data?.entities ?? [];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 18 * HOUR_PX;
  }, [view]);

  const remove = useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    onError: () => toast("Échec de l'annulation.", 'error'),
  });

  const [booking, setBooking] = useState<string | null>(null); // date key prefill

  const days = view === 'jour' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const shift = (dir: number) => setAnchor((a) => addDays(a, (view === 'jour' ? 1 : 7) * dir));
  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  };

  const rangeLabel =
    view === 'jour'
      ? anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : `${weekStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} – ${addDays(weekStart, 6).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  const cancel = async (ev: CalEvent) => {
    if (await confirm({ title: 'Annuler cet événement ?', message: `${ev.title} — ${ev.ownerName}`, destructive: true })) {
      remove.mutate(ev.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Précédent" className="grid h-9 w-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Suivant" className="grid h-9 w-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button variant="outline" onClick={goToday}>Aujourd'hui</Button>
        </div>
        <div className="flex-1 text-center text-sm font-semibold capitalize sm:text-base">{rangeLabel}</div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {(['semaine', 'jour', 'liste'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <Button
          onClick={() => {
            const inWeek = today >= weekStart && today < addDays(weekStart, 7);
            setBooking(dateKey(view === 'jour' ? anchor : inWeek ? today : weekStart));
          }}
        >
          <Plus className="h-4 w-4" />
          Réserver
        </Button>
      </div>

      {view === 'liste' ? (
        <ListView events={events} loading={q.isLoading} onCancel={cancel} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex border-b">
            <div className="w-14 shrink-0" />
            {days.map((d) => {
              const key = dateKey(d);
              const past = d < today;
              const isToday = +d === +today;
              return (
                <div key={key} className="flex-1 border-l px-2 py-2 text-center">
                  <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                    {DAY_NAMES[(d.getDay() + 6) % 7]} {pad(d.getDate())}/{pad(d.getMonth() + 1)}
                  </div>
                  {past ? (
                    <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Passé</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBooking(key)}
                      className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${isToday ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                      Réserver
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div ref={scrollRef} className="max-h-[62vh] overflow-y-auto">
            <div className="flex">
              <div className="w-14 shrink-0">
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }} className="relative">
                    <span className="absolute -top-2 right-1 text-[10px] text-muted-foreground">{h > 0 ? `${pad(h)}:00` : ''}</span>
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const dayEvents = events
                  .map((ev) => ({ ev, seg: segmentForDay(ev, d) }))
                  .filter((x): x is { ev: CalEvent; seg: { top: number; height: number } } => x.seg !== null);
                return (
                  <div key={dateKey(d)} className="relative flex-1 border-l" style={{ height: 24 * HOUR_PX }}>
                    {HOURS.map((h) => (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b border-border/40" />
                    ))}
                    {dayEvents.map(({ ev, seg }) => (
                      <div
                        key={ev.id}
                        style={{ top: seg.top, height: seg.height }}
                        className={`absolute inset-x-1 z-10 overflow-hidden rounded-lg border p-1.5 text-xs ${OWNER_STYLE[ev.ownerType]}`}
                      >
                        <div className="font-semibold leading-tight">{fmtTime(ev.startAt)}–{fmtTime(ev.endAt)}</div>
                        <div className="truncate font-medium leading-tight">{ev.title}</div>
                        <div className="truncate opacity-80">{ev.ownerName}</div>
                        {ev.canManage && (
                          <button
                            type="button"
                            onClick={() => cancel(ev)}
                            className="mt-1 w-full rounded bg-black/30 py-0.5 text-[10px] font-medium hover:bg-black/50"
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {booking !== null && (
        <BookingModal
          dateKey={booking}
          minDate={dateKey(weekStart)}
          maxDate={dateKey(addDays(weekStart, 6))}
          entities={entities}
          events={events}
          onClose={() => setBooking(null)}
          onDone={() => {
            setBooking(null);
            queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }}
        />
      )}
    </div>
  );
}

function ListView({ events, loading, onCancel }: { events: CalEvent[]; loading: boolean; onCancel: (e: CalEvent) => void }) {
  if (loading) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (events.length === 0) {
    return <EmptyState icon={CalendarDays} title="Aucun événement cette semaine" hint="Réserve un créneau pour ton entreprise ou ton association." />;
  }
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const k = e.startAt.slice(0, 10);
    const arr = byDay.get(k) ?? [];
    arr.push(e);
    byDay.set(k, arr);
  }
  return (
    <div className="space-y-4">
      {[...byDay.entries()].map(([day, evs]) => (
        <div key={day}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {parseDt(`${day} 00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            {evs.map((e, i) => (
              <div key={e.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}>
                <span className="w-24 shrink-0 text-sm font-medium tabular-nums">{fmtTime(e.startAt)}–{fmtTime(e.endAt)}</span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${e.ownerType === 'company' ? 'bg-sky-400' : 'bg-violet-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {e.ownerName}
                    {e.category ? ` · ${e.category}` : ''}
                  </div>
                </div>
                {e.canManage && (
                  <Button variant="outline" onClick={() => onCancel(e)}>Annuler</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BookingModal({
  dateKey: initialDate,
  minDate,
  maxDate,
  entities,
  events,
  onClose,
  onDone,
}: {
  dateKey: string;
  minDate: string;
  maxDate: string;
  entities: { type: 'company' | 'association'; id: number; name: string; slug: string }[];
  events: CalEvent[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [entityKey, setEntityKey] = useState(entities[0] ? `${entities[0].type}:${entities[0].id}` : '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState('21:00');
  const [end, setEnd] = useState('23:00');

  useEffect(() => {
    if (!entityKey && entities[0]) setEntityKey(`${entities[0].type}:${entities[0].id}`);
  }, [entities, entityKey]);

  const sameTime = end === start;
  const crosses = end < start;
  const startAt = `${date} ${start}:00`;
  const endDate = crosses ? dateKey(addDays(parseDt(`${date} 00:00:00`), 1)) : date;
  const endAt = `${endDate} ${end}:00`;

  const overlap = events.some((e) => startAt < e.endAt && endAt > e.startAt);

  const save = useMutation({
    mutationFn: () => {
      const [type, id] = entityKey.split(':');
      return createEvent({
        title: title.trim(),
        category: category.trim() || undefined,
        ownerType: type as 'company' | 'association',
        ownerId: Number(id),
        startAt,
        endAt,
      });
    },
    onSuccess: onDone,
    onError: () => toast('Échec de la réservation.', 'error'),
  });

  const valid = entityKey !== '' && title.trim().length > 0 && !!date && !sameTime;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Réserver un créneau</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {entities.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">
            Tu ne gères aucune entreprise ni association — tu ne peux pas réserver de créneau.
          </div>
        ) : (
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !save.isPending) save.mutate();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Pour</span>
              <select className={inputCls} value={entityKey} onChange={(e) => setEntityKey(e.target.value)}>
                {entities.map((en) => (
                  <option key={`${en.type}:${en.id}`} value={`${en.type}:${en.id}`}>
                    {en.name} ({en.type === 'company' ? 'entreprise' : 'association'})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Titre de l'événement</span>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. soirée d'inauguration" autoFocus />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Catégorie (optionnel)</span>
              <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex. showcase, concours…" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-3 text-sm sm:col-span-1">
                <span className="mb-1 block text-muted-foreground">Date</span>
                <input type="date" min={minDate} max={maxDate} className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Début</span>
                <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Fin</span>
                <input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            {sameTime && <p className="text-xs text-amber-400">L'heure de fin doit être différente de l'heure de début.</p>}
            {crosses && !sameTime && <p className="text-xs text-muted-foreground">Se termine le lendemain ({end}).</p>}
            {overlap && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                ⚠ Un autre événement est déjà prévu sur ce créneau. Tu peux réserver quand même, mais pense à te coordonner.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={!valid || save.isPending}>
                {save.isPending ? 'Réservation…' : 'Réserver'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
