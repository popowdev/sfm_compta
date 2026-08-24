import { useEffect, useState } from 'react';
import { useCompany } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  User,
  Users,
  Plus,
  X,
  LogIn,
  LogOut,
  Trash2,
  Pencil,
  Clock,
  Play,
  Coffee,
  Square,
} from 'lucide-react';
import { EMPLOYEE_POSITIONS, moduleConfigBool } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { fmtMoney, fmtInt } from '@/lib/declarations';
import { ApiError } from '@/lib/api';
import {
  getMyTimeclock,
  getTimeclock,
  addTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  clockStart,
  clockPause,
  clockResume,
  clockStop,
  fmtHours,
  fmtClock,
  fmtTime,
  fmtDay,
  dayKey,
  parseLocal,
  type AddTimeEntryInput,
  type EditTimeEntryInput,
  type EmployeeTimesheet,
  type TimeEntry,
} from '@/lib/timeclock';

const POS_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function EntriesTable({ entries }: { entries: TimeEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={Clock} title="Aucun pointage." />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 text-left font-semibold">Date</th>
            <th className="px-4 py-3 text-left font-semibold">Début</th>
            <th className="px-4 py-3 text-left font-semibold">Fin</th>
            <th className="px-4 py-3 text-left font-semibold">Travaillé</th>
            <th className="px-4 py-3 text-left font-semibold">Pauses</th>
            <th className="px-4 py-3 text-right font-semibold">Salaire</th>
            <th className="px-4 py-3 text-left font-semibold">Statut</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((t) => {
            const day = fmtDay(t.clockIn);
            return (
              <tr key={t.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{day.date}</div>
                  <div className="text-xs capitalize text-muted-foreground">{day.weekday}</div>
                </td>
                <td className="px-4 py-3 text-sky-300">{fmtTime(t.clockIn)}</td>
                <td className="px-4 py-3 text-rose-300">{t.clockOut ? fmtTime(t.clockOut) : '—'}</td>
                <td className="px-4 py-3 font-medium">{fmtHours(t.workedMinutes)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtHours(t.pauseMinutes)}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-400">
                  {fmtInt(t.salary)} $
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      t.complete ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {t.complete ? 'terminé' : 'en cours'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MyClock({ companyId, pausesEnabled }: { companyId: number; pausesEnabled: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['timeclock-me', companyId], queryFn: () => getMyTimeclock(companyId) });
  const current = q.data?.current ?? null;
  const paused = !!current?.pauseStart;
  const now = useNow(!!current && !paused);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['timeclock-me', companyId] });
    queryClient.invalidateQueries({ queryKey: ['timeclock', companyId] });
  };

  const start = useMutation({
    mutationFn: () => clockStart(companyId),
    onSuccess: invalidate,
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'week_hours_cap') {
        toast('Plafond d’heures de la semaine atteint : tu ne peux plus prendre le service.', 'error');
      } else if (code === 'already_open') {
        toast('Tu es déjà en service.', 'error');
      } else {
        toast('Impossible de prendre le service.', 'error');
      }
    },
  });
  const pause = useMutation({ mutationFn: () => clockPause(companyId), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => clockResume(companyId), onSuccess: invalidate });
  const stop = useMutation({ mutationFn: () => clockStop(companyId), onSuccess: invalidate });
  const busy = start.isPending || pause.isPending || resume.isPending || stop.isPending;

  if (q.isLoading)
    return (
      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-8">
          <div className="grid place-items-center gap-5">
            <Skeleton className="h-12 w-48 rounded-lg" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-11 w-56 rounded-lg" />
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  if (!q.data?.employee) {
    return (
      <div className="grid place-items-center gap-2 rounded-xl border border-dashed bg-card p-12 text-center">
        <User className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          Aucune fiche RH liée à ton compte. Demande à ton patron de créer ta fiche dans le module RH.
        </p>
      </div>
    );
  }

  let workedSec = 0;
  if (current && q.data) {
    const serverNow = parseLocal(q.data.now);
    const baseGross = (serverNow - parseLocal(current.clockIn)) / 1000;
    const basePause = current.pauseStart ? (serverNow - parseLocal(current.pauseStart)) / 1000 : 0;
    const baseWorked = baseGross - current.pauseMinutes * 60 - basePause;
    const sinceFetch = paused ? 0 : Math.max(0, (now - q.dataUpdatedAt) / 1000);
    workedSec = Math.max(0, baseWorked + sinceFetch);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-8">
        <div className="grid place-items-center gap-5">
          <div
            className={`font-mono text-5xl font-bold tabular-nums ${
              !current ? 'text-muted-foreground/40' : paused ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {fmtClock(workedSec)}
          </div>
          {current && (
            <div className="text-sm text-muted-foreground">
              Début : {fmtTime(current.clockIn)}
              {paused && <span className="ml-2 font-medium text-amber-400">· en pause</span>}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {!current ? (
              <button
                type="button"
                onClick={() => start.mutate()}
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-6 font-semibold text-white transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
              >
                <Play className="h-5 w-5" />
                Prendre son service
              </button>
            ) : (
              <>
                {paused ? (
                  <button
                    type="button"
                    onClick={() => resume.mutate()}
                    disabled={busy}
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-amber-500 px-6 font-semibold text-white transition-colors hover:bg-amber-500/90 disabled:opacity-50"
                  >
                    <Play className="h-5 w-5" />
                    Reprendre
                  </button>
                ) : (
                  pausesEnabled && (
                    <button
                      type="button"
                      onClick={() => pause.mutate()}
                      disabled={busy}
                      className="inline-flex h-11 items-center gap-2 rounded-lg bg-amber-500 px-6 font-semibold text-white transition-colors hover:bg-amber-500/90 disabled:opacity-50"
                    >
                      <Coffee className="h-5 w-5" />
                      Prendre une pause
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => stop.mutate()}
                  disabled={busy}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-destructive px-6 font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
                >
                  <Square className="h-5 w-5" />
                  Fin de service
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Mes derniers pointages
        </div>
        <EntriesTable entries={q.data.recent} />
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border bg-background/40 px-3 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function Timesheet({
  emp,
  onDelete,
  onEdit,
  canEdit,
  canDelete,
}: {
  emp: EmployeeTimesheet;
  onDelete: (id: number) => void;
  onEdit: (t: TimeEntry) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-background text-primary">
          <User className="h-4 w-4" />
        </div>
        <span className="font-semibold">{emp.name}</span>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium uppercase">
          {emp.grade ?? '—'}
        </span>
        <div className="ml-auto flex gap-2">
          <StatBox label="Heures" value={fmtHours(emp.totals.minutes)} accent="text-sky-400" />
          <StatBox label="Salaire" value={`${fmtInt(emp.totals.salary)} $`} accent="text-emerald-400" />
          <StatBox label="Jours" value={`${emp.totals.days}`} accent="text-foreground" />
        </div>
      </button>
      {open && (
        <div className="border-t">
          <EntriesTableWithDelete
            entries={emp.entries}
            onDelete={onDelete}
            onEdit={onEdit}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </div>
      )}
    </div>
  );
}

function EntriesTableWithDelete({
  entries,
  onDelete,
  onEdit,
  canEdit,
  canDelete,
}: {
  entries: TimeEntry[];
  onDelete: (id: number) => void;
  onEdit: (t: TimeEntry) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const confirm = useConfirm();
  if (entries.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={Clock} title="Aucun pointage." />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 text-left font-semibold">Date</th>
            <th className="px-4 py-3 text-left font-semibold">Arrivée</th>
            <th className="px-4 py-3 text-left font-semibold">Départ</th>
            <th className="px-4 py-3 text-left font-semibold">Travaillé</th>
            <th className="px-4 py-3 text-right font-semibold">Salaire</th>
            <th className="px-4 py-3 text-left font-semibold">Statut</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((t) => {
            const day = fmtDay(t.clockIn);
            return (
              <tr key={t.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{day.date}</div>
                  <div className="text-xs capitalize text-muted-foreground">{day.weekday}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 rounded-md bg-sky-500/10 px-2 py-1 text-sky-300">
                    <LogIn className="h-3.5 w-3.5" />
                    {fmtTime(t.clockIn)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {t.clockOut ? (
                    <span className="inline-flex items-center gap-2 rounded-md bg-rose-500/10 px-2 py-1 text-rose-300">
                      <LogOut className="h-3.5 w-3.5" />
                      {fmtTime(t.clockOut)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-sky-400">{fmtHours(t.workedMinutes)}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-400">
                  {fmtInt(t.salary)} $
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      t.complete ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {t.complete ? 'terminé' : 'en cours'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Modifier ce pointage"
                        title="Modifier les heures"
                        onClick={() => onEdit(t)}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Supprimer ce pointage"
                        title="Supprimer ce pointage"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: 'Supprimer ce pointage ?',
                              message: 'Cette action est définitive.',
                              destructive: true,
                            })
                          )
                            onDelete(t.id);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamView({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['timeclock', companyId], queryFn: () => getTimeclock(companyId) });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [f, setF] = useState({ employeeId: '', date: today(), clockIn: '', clockOut: '' });
  const setField = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['timeclock', companyId] });

  const add = useMutation({
    mutationFn: (body: AddTimeEntryInput) => addTimeEntry(companyId, body),
    onSuccess: () => {
      invalidate();
      close();
    },
    onError: () => toast("Échec de l'enregistrement du pointage.", 'error'),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: EditTimeEntryInput }) =>
      updateTimeEntry(companyId, id, body),
    onSuccess: () => {
      invalidate();
      close();
    },
    onError: () => toast('Échec de la modification du pointage.', 'error'),
  });
  function close() {
    setOpen(false);
    setEditId(null);
    setEditEmpName('');
    setF({ employeeId: '', date: today(), clockIn: '', clockOut: '' });
    add.reset();
    update.reset();
  }
  function openEdit(emp: EmployeeTimesheet, t: TimeEntry) {
    setEditId(t.id);
    setEditEmpName(emp.name);
    setF({
      employeeId: String(emp.id),
      date: dayKey(t.clockIn),
      clockIn: fmtTime(t.clockIn),
      clockOut: t.clockOut ? fmtTime(t.clockOut) : '',
    });
    setOpen(true);
  }
  const remove = useMutation({
    mutationFn: (id: number) => deleteTimeEntry(companyId, id),
    onSuccess: invalidate,
    onError: () => toast('Échec de la suppression du pointage.', 'error'),
  });

  const canEdit = q.data?.canEdit ?? false;
  const canDelete = q.data?.canDelete ?? false;
  const all = q.data?.employees ?? [];
  const list = all.filter((e) => e.active || e.entries.length > 0);
  const addable = all.filter((e) => e.active);

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger les pointages de l'équipe.</p>
        <Button variant="outline" onClick={() => q.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditId(null);
            setOpen(true);
          }}
          disabled={addable.length === 0}
        >
          <Plus className="h-4 w-4" />
          Nouveau pointage
        </Button>
      </div>

      <div className="space-y-3">
        {list.map((emp) => (
          <Timesheet
            key={emp.id}
            emp={emp}
            onDelete={(id) => remove.mutate(id)}
            onEdit={(t) => openEdit(emp, t)}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        ))}
        {list.length === 0 &&
          (all.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucun employé"
              hint="Ajoute d’abord des employés dans le module RH."
            />
          ) : (
            <EmptyState icon={Clock} title="Aucun pointage enregistré." />
          ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editId ? 'Modifier le pointage' : 'Nouveau pointage'}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                title="Fermer"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!f.employeeId || !f.clockIn) return;
                if (editId) {
                  update.mutate({
                    id: editId,
                    body: { date: f.date, clockIn: f.clockIn, clockOut: f.clockOut || undefined },
                  });
                } else {
                  add.mutate({
                    employeeId: Number(f.employeeId),
                    date: f.date,
                    clockIn: f.clockIn,
                    clockOut: f.clockOut || undefined,
                  });
                }
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Employé</span>
                {editId ? (
                  <input className={inputCls} value={editEmpName} disabled />
                ) : (
                  <select className={inputCls} value={f.employeeId} onChange={(e) => setField('employeeId', e.target.value)}>
                    <option value="">— choisir —</option>
                    {addable.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Date</span>
                <input type="date" className={inputCls} value={f.date} onChange={(e) => setField('date', e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Arrivée</span>
                  <input type="time" className={inputCls} value={f.clockIn} onChange={(e) => setField('clockIn', e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Départ (optionnel)</span>
                  <input type="time" className={inputCls} value={f.clockOut} onChange={(e) => setField('clockOut', e.target.value)} />
                </label>
              </div>
              {(add.isError || update.isError) && (
                <p className="text-sm text-destructive">Échec. Vérifie l'employé et les horaires.</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={!f.employeeId || !f.clockIn || add.isPending || update.isPending}
                >
                  {editId
                    ? update.isPending
                      ? 'Enregistrement…'
                      : 'Enregistrer'
                    : add.isPending
                      ? 'Ajout…'
                      : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Badgeuse() {
  const { company, companyId } = useCompany();
  const pausesEnabled = moduleConfigBool(
    company?.modules.find((m) => m.key === 'badgeuse')?.config,
    'badgeuse',
    'pauses',
  );
  const [tab, setTab] = useState<'me' | 'team'>('me');
  const me = useQuery({ queryKey: ['timeclock-me', companyId], queryFn: () => getMyTimeclock(companyId) });
  const canManageTeam = me.data?.canManageTeam ?? false;

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
    }`;

  if (me.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-11 w-72 rounded-lg" />
        <div className="rounded-xl border bg-card p-8">
          <div className="grid place-items-center gap-5">
            <Skeleton className="h-12 w-48 rounded-lg" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-11 w-56 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {canManageTeam && (
        <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
          <button type="button" className={tabCls(tab === 'me')} onClick={() => setTab('me')}>
            <Clock className="h-4 w-4" />
            Mon pointage
          </button>
          <button type="button" className={tabCls(tab === 'team')} onClick={() => setTab('team')}>
            <Users className="h-4 w-4" />
            Résumé équipe
          </button>
        </div>
      )}

      {canManageTeam && tab === 'team' ? (
        <TeamView companyId={companyId} />
      ) : (
        <MyClock companyId={companyId} pausesEnabled={pausesEnabled} />
      )}
    </div>
  );
}
