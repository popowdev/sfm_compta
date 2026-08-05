import { useState } from 'react';
import { useCompany } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, Trash2, Coins, Users, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { getRuns, addRun, deleteRun } from '@/lib/runs';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtInt(n)} $`;
const fmtDay = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtDayTime = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Runs() {
  const { companyId, isLoading } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [weekOffset, setWeekOffset] = useState(0);
  const q = useQuery({ queryKey: ['runs', companyId, weekOffset], queryFn: () => getRuns(companyId, weekOffset), enabled: !!companyId });
  const inv = () => queryClient.invalidateQueries({ queryKey: ['runs', companyId] });

  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [qty, setQty] = useState('1');

  const add = useMutation({
    mutationFn: () => addRun(companyId, { employeeId: employeeId || undefined, qty: Math.max(1, Math.floor(Number(qty) || 1)) }),
    onSuccess: () => { toast('Run enregistrée.', 'success'); setQty('1'); inv(); },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });
  const del = useMutation({ mutationFn: (id: number) => deleteRun(companyId, id), onSuccess: inv, onError: () => toast('Échec.', 'error') });

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={Truck} title="Runs / livraisons" hint="Module indisponible." />;

  const { config, week, employees, runs, summary, canWrite, canManage } = q.data;
  const qtyN = Math.max(1, Math.floor(Number(qty) || 1));
  const previewTotal = qtyN * config.unitPrice;
  const previewComm = Math.round((previewTotal * config.commissionPct) / 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)}><ChevronLeft className="h-4 w-4" /> Précédente</Button>
        <div className="text-center">
          <div className="text-sm font-semibold">{week.offset === 0 ? 'Semaine en cours' : 'Semaine passée'}</div>
          <div className="text-[11px] text-muted-foreground">{week.label}</div>
        </div>
        <Button variant="outline" size="sm" disabled={week.offset >= 0} onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}>Suivante <ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Truck} label="Runs livrées" value={String(summary.totalRuns)} sub={`${summary.count} enregistrement${summary.count > 1 ? 's' : ''}`} accent="text-sky-400" />
        <Kpi icon={Coins} label="CA total runs" value={money(summary.totalRevenue)} sub={`${config.unitPrice} $ / run`} accent="text-emerald-400" />
        <Kpi icon={Users} label="Part employés" value={money(summary.totalCommission)} sub={`${config.commissionPct} % par run`} accent="text-amber-400" />
        <Kpi icon={Building2} label="Part entreprise" value={money(summary.companyShare)} sub={`${100 - config.commissionPct} % par run`} accent="text-violet-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canWrite && week.offset === 0 && (
          <form
            className="space-y-4 rounded-2xl border bg-card p-6"
            onSubmit={(e) => { e.preventDefault(); if (!add.isPending) add.mutate(); }}
          >
            <h3 className="text-sm font-semibold">Enregistrer une run</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Employé (qui a fait la run)</span>
              <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Sans employé (part entreprise seule) —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Nombre de runs</span>
              <input type="number" min="1" step="1" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <div className="space-y-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total</span><span className="text-lg font-bold text-emerald-400">{money(previewTotal)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Part employé ({config.commissionPct}%)</span><span className="font-semibold text-amber-400">{money(previewComm)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Part entreprise</span><span className="font-semibold text-violet-400">{money(previewTotal - previewComm)}</span></div>
            </div>
            <Button type="submit" className="w-full" disabled={add.isPending}><Plus className="h-4 w-4" /> {add.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
            <p className="text-[11px] text-muted-foreground">Prix et part employé réglables dans les Options du module (⚙️).</p>
          </form>
        )}

        <div className={`rounded-2xl border bg-card p-6 ${canWrite && week.offset === 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h3 className="mb-3 text-sm font-semibold">Historique des runs</h3>
          {runs.length === 0 ? (
            <EmptyState icon={Truck} title="Aucune run" hint="Enregistre la première livraison." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Date</th>
                    <th className="py-2 text-left font-semibold">Employé</th>
                    <th className="py-2 text-right font-semibold">Runs</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                    <th className="py-2 text-right font-semibold">Part employé</th>
                    {canManage && <th className="py-2 text-left font-semibold">Ajouté (log)</th>}
                    {canManage && <th className="py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 text-muted-foreground">{fmtDay(r.createdAt)}</td>
                      <td className="py-2 font-medium">{r.employeeName ?? '—'}</td>
                      <td className="py-2 text-right">{r.qty}</td>
                      <td className="py-2 text-right text-emerald-400">{money(r.total)}</td>
                      <td className="py-2 text-right text-amber-400">{money(r.commission)}</td>
                      {canManage && <td className="py-2 text-xs text-muted-foreground">{r.authorName ?? '—'} · {fmtDayTime(r.createdAt)}</td>}
                      {canManage && <td className="py-2 text-right"><button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer cette run ?', message: `${r.qty} run(s) · ${money(r.total)}`, destructive: true })) del.mutate(r.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button></td>}
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

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: typeof Truck; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${accent}`} /> {label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
