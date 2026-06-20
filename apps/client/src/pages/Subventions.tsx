import { useState } from 'react';
import { useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, FileText, Clock, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtMoney } from '@/lib/declarations';
import {
  getMySubventions,
  requestSubvention,
  type SubventionStatus,
  type SubventionRequestInput,
} from '@/lib/subventions';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export const SUB_STATUS: Record<SubventionStatus, { label: string; cls: string }> = {
  pending: { label: 'en attente', cls: 'bg-amber-500/10 text-amber-400' },
  approved: { label: 'accordée', cls: 'bg-primary/10 text-primary' },
  rejected: { label: 'refusée', cls: 'bg-destructive/10 text-destructive' },
  paid: { label: 'versée', cls: 'bg-emerald-500/10 text-emerald-400' },
};

const EMPTY = { motif: '', requesterName: '', amountRequested: '', notes: '' };

export default function Subventions() {
  const { companyId, canCreate } = useModulePerms('subventions');
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ['subventions', companyId],
    queryFn: () => getMySubventions(companyId),
  });

  const [form, setForm] = useState({ ...EMPTY });
  const [open, setOpen] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setOpen(false);
    setForm({ ...EMPTY });
  };
  const openNew = () => {
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const request = useMutation({
    mutationFn: (body: SubventionRequestInput) => requestSubvention(companyId, body),
    onSuccess: () => {
      close();
      queryClient.invalidateQueries({ queryKey: ['subventions', companyId] });
    },
  });

  const list = q.data?.subventions ?? [];
  const granted = list
    .filter((s) => s.status === 'approved' || s.status === 'paid')
    .reduce((sum, s) => sum + (s.amountGranted ?? 0), 0);
  const pending = list.filter((s) => s.status === 'pending').length;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={FileText} label="Demandes" value={String(list.length)} />
          <Kpi icon={Clock} label="En attente" value={String(pending)} accent="text-amber-400" />
          <Kpi
            icon={Coins}
            label="Total accordé"
            value={`${fmtMoney(granted)} $`}
            accent="text-primary"
          />
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune demande de subvention"
          hint="Les demandes envoyées apparaîtront ici."
          action={
            canCreate ? (
              <Button variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Faire une demande
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Motif</th>
                  <th className="px-4 py-3 text-left font-semibold">Demandeur</th>
                  <th className="px-4 py-3 text-right font-semibold">Demandé</th>
                  <th className="px-4 py-3 text-right font-semibold">Accordé</th>
                  <th className="px-4 py-3 text-left font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      {s.motif}
                      {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.requesterName}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(s.amountRequested)} $</td>
                    <td className="px-4 py-3 text-right">
                      {s.amountGranted === null ? '—' : `${fmtMoney(s.amountGranted)} $`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${SUB_STATUS[s.status].cls}`}
                      >
                        {SUB_STATUS[s.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={close}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouvelle demande de subvention</h2>
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
                if (form.motif.trim() && form.requesterName.trim()) {
                  request.mutate({
                    motif: form.motif.trim(),
                    requesterName: form.requesterName.trim(),
                    amountRequested: Number(form.amountRequested) || 0,
                    notes: form.notes.trim() || undefined,
                  });
                }
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Motif</span>
                  <input
                    className={inputCls}
                    placeholder="ex. aide à l'embauche"
                    value={form.motif}
                    onChange={(e) => set('motif', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Demandeur (nom/prénom)</span>
                  <input
                    className={inputCls}
                    value={form.requesterName}
                    onChange={(e) => set('requesterName', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Montant demandé ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={form.amountRequested}
                    onChange={(e) => set('amountRequested', e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Détails / justificatif</span>
                  <textarea
                    className={`${inputCls} h-20 py-2`}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={!form.motif.trim() || !form.requesterName.trim() || request.isPending}
                >
                  {request.isPending ? 'Envoi…' : 'Envoyer la demande'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
