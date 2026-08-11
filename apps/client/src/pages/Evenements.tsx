import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Trash2, Image as ImageIcon } from 'lucide-react';
import { useCompany } from '@/lib/useCompany';
import { fmtMoney } from '@/lib/declarations';
import {
  getCompanyEvents,
  createCompanyEvent,
  deleteCompanyEvent,
  type CompanyEvent,
} from '@/lib/companyEvents';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtMoney(n)} $`;

export default function Evenements() {
  const { company: mine, companyId, isLoading } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const q = useQuery({
    queryKey: ['company-events', companyId],
    queryFn: () => getCompanyEvents(companyId),
    enabled: !!companyId,
  });

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [revenue, setRevenue] = useState('');
  const [charges, setCharges] = useState('0');
  const [notes, setNotes] = useState('');
  const [poster, setPoster] = useState<File | null>(null);

  const rev = Number(revenue) || 0;
  const chg = Number(charges) || 0;
  const profit = Math.round((rev - chg) * 100) / 100;

  const create = useMutation({
    mutationFn: () =>
      createCompanyEvent(companyId, {
        title: title.trim(),
        eventDate,
        revenue: String(rev),
        charges: String(chg),
        notes: notes.trim() || undefined,
        poster,
      }),
    onSuccess: () => {
      toast('Évènement enregistré.', 'success');
      setTitle('');
      setEventDate('');
      setRevenue('');
      setCharges('0');
      setNotes('');
      setPoster(null);
      queryClient.invalidateQueries({ queryKey: ['company-events', companyId] });
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.code === 'forbidden'
          ? "Tu ne peux pas déclarer d'évènement pour cette entreprise."
          : "Échec de l'enregistrement.",
        'error',
      ),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCompanyEvent(companyId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-events', companyId] }),
    onError: () => toast('Suppression impossible.', 'error'),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (!mine) return <Navigate to="/" replace />;

  const events = q.data?.events ?? [];
  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(eventDate);

  const del = async (ev: CompanyEvent) => {
    if (await confirm({ title: 'Supprimer cet évènement ?', message: ev.title, destructive: true })) {
      remove.mutate(ev.id);
    }
  };

  return (
    <div className="space-y-6 p-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Espace entreprise</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Évènements</h1>
        <p className="text-sm text-muted-foreground">
          Déclare tes évènements — le bénéfice est calculé automatiquement (CA − investissement).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !create.isPending) create.mutate();
          }}
        >
          <h3 className="text-sm font-semibold">Déclarer un évènement</h3>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Nom de l'évènement</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. soirée d'inauguration" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Date de l'évènement</span>
            <input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Montant demandé (CA)</span>
              <input type="number" step="0.01" min="0" className={inputCls} value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Investissement</span>
              <input type="number" step="0.01" min="0" className={inputCls} value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Affiche (optionnel)</span>
            <input
              type="file"
              accept="image/*"
              className={`${inputCls} py-1.5 file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs`}
              onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Notes (optionnel)</span>
            <textarea className={`${inputCls} h-auto py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">Bénéfice de l'évènement</span>
            <span className={`font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(profit)}</span>
          </div>
          <Button type="submit" className="w-full" disabled={!valid || create.isPending}>
            {create.isPending ? 'Enregistrement…' : "Enregistrer l'évènement"}
          </Button>
        </form>

        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Historique des évènements</h3>
          {q.isLoading ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : q.isError ? (
            <div className="grid place-items-center gap-3 py-12 text-sm text-muted-foreground">
              Impossible de charger les évènements.
              <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : events.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Aucun évènement" hint="Déclare ton premier évènement avec le formulaire." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Affiche</th>
                    <th className="py-2 pr-3 font-medium">Évènement</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 text-right font-medium">CA</th>
                    <th className="py-2 pr-3 text-right font-medium">Investi</th>
                    <th className="py-2 pr-3 text-right font-medium">Bénéfice</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {ev.posterUrl ? (
                          <a href={ev.posterUrl} target="_blank" rel="noreferrer">
                            <img src={ev.posterUrl} alt="" className="h-10 w-10 rounded object-cover" />
                          </a>
                        ) : (
                          <span className="grid h-10 w-10 place-items-center rounded bg-muted text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        {ev.title}
                        {ev.notes ? <span className="block text-xs font-normal text-muted-foreground">{ev.notes}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{ev.eventDate}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(ev.revenue)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{money(ev.charges)}</td>
                      <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${ev.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {money(ev.profit)}
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => del(ev)} className="text-muted-foreground hover:text-red-400" aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
