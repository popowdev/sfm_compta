import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, User, Plus, X, LogIn, LogOut, Trash2 } from 'lucide-react';
import { EMPLOYEE_POSITIONS } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { fmtMoney } from '@/lib/declarations';
import {
  getTimeclock,
  addTimeEntry,
  deleteTimeEntry,
  fmtHours,
  fmtTime,
  fmtDay,
  type AddTimeEntryInput,
  type EmployeeTimesheet,
} from '@/lib/timeclock';

const POS_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  canWrite,
  onDelete,
}: {
  emp: EmployeeTimesheet;
  canWrite: boolean;
  onDelete: (id: number) => void;
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
          {POS_LABEL[emp.position] ?? emp.position}
        </span>
        <div className="ml-auto flex gap-2">
          <StatBox label="Heures" value={fmtHours(emp.totals.minutes)} accent="text-sky-400" />
          <StatBox label="Salaire" value={`${fmtMoney(emp.totals.salary)} $`} accent="text-emerald-400" />
          <StatBox label="Jours" value={`${emp.totals.days}`} accent="text-foreground" />
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto border-t">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Arrivée</th>
                <th className="px-4 py-3 text-left font-semibold">Départ</th>
                <th className="px-4 py-3 text-left font-semibold">Heures</th>
                <th className="px-4 py-3 text-right font-semibold">Salaire</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                {canWrite && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {emp.entries.map((t) => {
                const day = fmtDay(t.clockIn);
                const complete = t.clockOut !== null;
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
                    <td className="px-4 py-3 font-medium text-sky-400">{fmtHours(t.minutes)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-400">
                      {fmtMoney(t.salary)} $
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          complete
                            ? 'bg-primary/10 text-primary'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {complete ? 'complet' : 'en cours'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Supprimer ce pointage ?')) onDelete(t.id);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {emp.entries.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 7 : 6} className="px-4 py-4 text-muted-foreground">
                    Aucun pointage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Badgeuse() {
  const { id } = useParams();
  const companyId = Number(id);
  const queryClient = useQueryClient();

  const q = useQuery({ queryKey: ['timeclock', companyId], queryFn: () => getTimeclock(companyId) });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employeeId: '', date: today(), clockIn: '', clockOut: '' });
  const setField = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const add = useMutation({
    mutationFn: (body: AddTimeEntryInput) => addTimeEntry(companyId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeclock', companyId] });
      close();
    },
  });

  function close() {
    setOpen(false);
    setF({ employeeId: '', date: today(), clockIn: '', clockOut: '' });
    add.reset();
  }
  const remove = useMutation({
    mutationFn: (eid: number) => deleteTimeEntry(companyId, eid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeclock', companyId] }),
  });

  const canWrite = q.data?.canWrite ?? false;
  const all = q.data?.employees ?? [];
  const list = all.filter((e) => e.active || e.entries.length > 0);
  const addable = all.filter((e) => e.active);

  return (
    <div className="max-w-5xl space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)} disabled={addable.length === 0}>
            <Plus className="h-4 w-4" />
            Nouveau pointage
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {list.map((emp) => (
          <Timesheet key={emp.id} emp={emp} canWrite={canWrite} onDelete={(eid) => remove.mutate(eid)} />
        ))}
        {list.length === 0 && (
          <div className="grid place-items-center rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? 'Ajoute d’abord des employés dans le module RH.'
              : 'Aucun pointage enregistré.'}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close}>
          <div
            className="w-full max-w-md rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouveau pointage</h2>
              <button
                type="button"
                onClick={close}
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
                add.mutate({
                  employeeId: Number(f.employeeId),
                  date: f.date,
                  clockIn: f.clockIn,
                  clockOut: f.clockOut || undefined,
                });
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Employé</span>
                <select
                  className={inputCls}
                  value={f.employeeId}
                  onChange={(e) => setField('employeeId', e.target.value)}
                >
                  <option value="">— choisir —</option>
                  {addable.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Date</span>
                <input
                  type="date"
                  className={inputCls}
                  value={f.date}
                  onChange={(e) => setField('date', e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Arrivée</span>
                  <input
                    type="time"
                    className={inputCls}
                    value={f.clockIn}
                    onChange={(e) => setField('clockIn', e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Départ (optionnel)</span>
                  <input
                    type="time"
                    className={inputCls}
                    value={f.clockOut}
                    onChange={(e) => setField('clockOut', e.target.value)}
                  />
                </label>
              </div>
              {add.isError && (
                <p className="text-sm text-destructive">
                  Échec de l'ajout. Vérifie l'employé et les horaires.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!f.employeeId || !f.clockIn || add.isPending}>
                  {add.isPending ? 'Ajout…' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
