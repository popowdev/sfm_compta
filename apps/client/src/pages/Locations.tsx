import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Phone,
  CalendarDays,
  Wallet,
  ShieldCheck,
  CalendarClock,
} from 'lucide-react';
import { moduleConfigBool } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm';
import { fmtMoney } from '@/lib/declarations';
import { useModulePerms } from '@/lib/useCompany';
import {
  getRentals,
  createRental,
  updateRental,
  deleteRental,
  RENTAL_STATUS,
  DEPOSIT_STATUS,
  type Rental,
  type RentalInput,
  type DepositStatus,
  type RentalStatus,
} from '@/lib/rentals';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR');
}

const EMPTY = {
  clientName: '',
  clientPhone: '',
  label: '',
  eventDate: '',
  eventTime: '',
  durationHours: '',
  rentalPrice: '',
  deposit: '',
  depositStatus: 'paid' as DepositStatus,
  status: 'reserved' as RentalStatus,
  notes: '',
};

export default function Locations() {
  const { company, companyId, canCreate, canEdit, canDelete } = useModulePerms('locations');
  const cfg = company?.modules.find((m) => m.key === 'locations')?.config;
  const showDeposit = moduleConfigBool(cfg, 'locations', 'deposit');
  const showDuration = moduleConfigBool(cfg, 'locations', 'duration');
  const showTime = moduleConfigBool(cfg, 'locations', 'time');
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const q = useQuery({ queryKey: ['rentals', companyId], queryFn: () => getRentals(companyId) });

  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setOpen(false);
    setEditing(null);
    setForm({ ...EMPTY });
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['rentals', companyId] });
    close();
  };

  const create = useMutation({
    mutationFn: (body: RentalInput) => createRental(companyId, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: RentalInput }) => updateRental(companyId, v.id, v.body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (rid: number) => deleteRental(companyId, rid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rentals', companyId] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };
  const openEdit = (r: Rental) => {
    setEditing(r.id);
    setForm({
      clientName: r.clientName,
      clientPhone: r.clientPhone ?? '',
      label: r.label,
      eventDate: r.eventDate,
      eventTime: r.eventTime ?? '',
      durationHours: r.durationHours === null ? '' : String(r.durationHours),
      rentalPrice: String(r.rentalPrice),
      deposit: String(r.deposit),
      depositStatus: r.depositStatus,
      status: r.status,
      notes: r.notes ?? '',
    });
    setOpen(true);
  };

  const submit = () => {
    const body: RentalInput = {
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim() || undefined,
      label: form.label.trim(),
      eventDate: form.eventDate,
      eventTime: showTime || editing !== null ? form.eventTime.trim() || undefined : undefined,
      durationHours:
        (showDuration || editing !== null) && form.durationHours ? Number(form.durationHours) : undefined,
      rentalPrice: Number(form.rentalPrice) || 0,
      deposit: showDeposit || editing !== null ? Number(form.deposit) || 0 : 0,
      depositStatus: showDeposit || editing !== null ? form.depositStatus : 'paid',
      status: form.status,
      notes: form.notes.trim() || undefined,
    };
    if (editing !== null) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const list = q.data?.rentals ?? [];
  const revenue = list.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.rentalPrice, 0);
  const held = list.filter((r) => r.depositStatus === 'paid').reduce((s, r) => s + r.deposit, 0);
  const upcoming = list.filter((r) => r.status === 'reserved').length;
  const pending = create.isPending || update.isPending;
  const valid = form.clientName.trim() && form.label.trim() && form.eventDate;

  if (q.isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          {showDeposit && <KpiSkeleton />}
          <KpiSkeleton />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={Wallet} label="CA locations" value={`${fmtMoney(revenue)} $`} accent="text-primary" />
          {showDeposit && (
            <Kpi
              icon={ShieldCheck}
              label="Cautions détenues"
              value={`${fmtMoney(held)} $`}
              accent="text-emerald-400"
            />
          )}
          <Kpi icon={CalendarClock} label="À venir" value={String(upcoming)} accent="text-amber-400" />
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouvelle location
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{r.label}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${RENTAL_STATUS[r.status].cls}`}>
                    {RENTAL_STATUS[r.status].label}
                  </span>
                  {showDeposit && (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${DEPOSIT_STATUS[r.depositStatus].cls}`}>
                      {DEPOSIT_STATUS[r.depositStatus].label}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{r.clientName}</span>
                  {r.clientPhone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {r.clientPhone}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {fmtDate(r.eventDate)}
                    {showTime && r.eventTime ? ` · ${r.eventTime}` : ''}
                    {showDuration && r.durationHours ? ` · ${r.durationHours}h` : ''}
                  </span>
                </div>
              </div>
              {(canEdit || canDelete) && (
                <div className="flex shrink-0 gap-1">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      title="Modifier"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: 'Supprimer cette location ?',
                            message: 'Cette action est définitive.',
                            destructive: true,
                          })
                        )
                          remove.mutate(r.id);
                      }}
                      title="Supprimer"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Prix</div>
                <div className="text-sm font-medium">{fmtMoney(r.rentalPrice)} $</div>
              </div>
              {showDeposit && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Caution</div>
                  <div className="text-sm font-medium">{fmtMoney(r.deposit)} $</div>
                </div>
              )}
            </div>
            {r.notes && <div className="mt-3 text-sm text-muted-foreground">{r.notes}</div>}
          </div>
        ))}
        {list.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="Aucune location enregistrée."
            action={
              canCreate ? (
                <Button variant="outline" onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Ajouter la première location
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editing !== null ? 'Modifier la location' : 'Nouvelle location'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className={labelCls}>Client</span>
                  <input className={inputCls} value={form.clientName} onChange={(e) => set('clientName', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Téléphone</span>
                  <input className={inputCls} value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Objet (véhicule, salle, événement…)</span>
                  <input
                    className={inputCls}
                    placeholder="ex. Location salle · Prêt véhicule · Soirée privée"
                    value={form.label}
                    onChange={(e) => set('label', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Date</span>
                  <input type="date" className={inputCls} value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
                </label>
                {showTime && (
                  <label className="text-sm">
                    <span className={labelCls}>Heure</span>
                    <input className={inputCls} placeholder="20:00" value={form.eventTime} onChange={(e) => set('eventTime', e.target.value)} />
                  </label>
                )}
                {showDuration && (
                  <label className="text-sm">
                    <span className={labelCls}>Durée (h)</span>
                    <input type="number" min="0" step="1" className={inputCls} value={form.durationHours} onChange={(e) => set('durationHours', e.target.value)} />
                  </label>
                )}
                <label className="text-sm">
                  <span className={labelCls}>Prix ($)</span>
                  <input type="number" min="0" step="0.01" className={inputCls} value={form.rentalPrice} onChange={(e) => set('rentalPrice', e.target.value)} />
                </label>
                {showDeposit && (
                  <>
                    <label className="text-sm">
                      <span className={labelCls}>Caution ($)</span>
                      <input type="number" min="0" step="0.01" className={inputCls} value={form.deposit} onChange={(e) => set('deposit', e.target.value)} />
                    </label>
                    <label className="text-sm">
                      <span className={labelCls}>État caution</span>
                      <select className={inputCls} value={form.depositStatus} onChange={(e) => set('depositStatus', e.target.value as DepositStatus)}>
                        <option value="paid">Payée</option>
                        <option value="returned">Rendue</option>
                        <option value="kept">Conservée</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="text-sm">
                  <span className={labelCls}>Statut</span>
                  <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as RentalStatus)}>
                    <option value="reserved">Réservé</option>
                    <option value="active">En cours</option>
                    <option value="completed">Terminé</option>
                    <option value="cancelled">Annulé</option>
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Notes</span>
                  <textarea className={`${inputCls} h-16 py-2`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!valid || pending}>
                  {pending ? 'Enregistrement…' : editing !== null ? 'Enregistrer' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
