import { useMemo, useState } from 'react';
import { useCompany } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Plus, Trash2, Coins, Users, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { getCargaisons, addCargaison, deleteCargaison } from '@/lib/cargaison';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const money = (n: number) => `${fmtInt(n)} $`;
const fmtDay = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtDayTime = (s: string) => new Date(String(s).replace(' ', 'T')).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Cargaison() {
  const { companyId, isLoading } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [weekOffset, setWeekOffset] = useState(0);
  const q = useQuery({ queryKey: ['cargaison', companyId, weekOffset], queryFn: () => getCargaisons(companyId, weekOffset), enabled: !!companyId });
  const inv = () => queryClient.invalidateQueries({ queryKey: ['cargaison', companyId] });

  const [clientName, setClientName] = useState('');
  const [product, setProduct] = useState('');
  const [qty, setQty] = useState('1');
  const [total, setTotal] = useState('');
  const [parts, setParts] = useState<number[]>([]);

  const add = useMutation({
    mutationFn: () =>
      addCargaison(companyId, {
        clientName: clientName.trim(),
        product: product.trim() || undefined,
        qty: Math.max(1, Math.floor(Number(qty) || 1)),
        total: Math.max(1, Math.floor(Number(total) || 0)),
        participantIds: parts,
      }),
    onSuccess: () => {
      toast('Commande enregistrée.', 'success');
      setClientName(''); setProduct(''); setQty('1'); setTotal(''); setParts([]);
      inv();
    },
    onError: () => toast("Échec de l'enregistrement.", 'error'),
  });
  const del = useMutation({ mutationFn: (id: number) => deleteCargaison(companyId, id), onSuccess: inv, onError: () => toast('Échec.', 'error') });

  const companyPct = q.data?.config.companyPct ?? 25;
  const preview = useMemo(() => {
    const t = Math.max(0, Math.floor(Number(total) || 0));
    const pool = Math.round((t * (100 - companyPct)) / 100);
    const n = parts.length;
    const share = n > 0 ? Math.floor(pool / n) : 0;
    const employeeShare = share * n;
    return { t, share, employeeShare, companyShare: t - employeeShare, n };
  }, [total, companyPct, parts]);

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={PackageCheck} title="Cargaison / commandes" hint="Module indisponible." />;

  const { week, employees, cargaisons, summary, canManage } = q.data;
  const toggle = (id: number) => setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const canSubmit = clientName.trim().length > 0 && preview.t > 0;

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
        <Kpi icon={PackageCheck} label="Commandes" value={String(summary.count)} sub={`Semaine`} accent="text-sky-400" />
        <Kpi icon={Coins} label="CA total" value={money(summary.totalRevenue)} sub="Montant des commandes" accent="text-emerald-400" />
        <Kpi icon={Users} label="Part employés" value={money(summary.totalEmployee)} sub={`${100 - companyPct} % réparti`} accent="text-amber-400" />
        <Kpi icon={Building2} label="Part entreprise" value={money(summary.totalCompany)} sub={`${companyPct} % gardé`} accent="text-violet-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canManage && week.offset === 0 && (
          <form
            className="space-y-4 rounded-2xl border bg-card p-6 lg:col-span-1"
            onSubmit={(e) => { e.preventDefault(); if (!add.isPending && canSubmit) add.mutate(); }}
          >
            <h3 className="text-sm font-semibold">Enregistrer une commande</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Entreprise cliente</span>
              <input className={inputCls} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex. LSCustom" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Quantité</span>
              <input type="number" min="1" step="1" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Produit commandé</span>
              <input className={inputCls} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex. Pare-chocs" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Montant total ($)</span>
              <input type="number" min="1" step="1" className={inputCls} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="100000" />
            </label>

            <div className="space-y-2">
              <span className="block text-xs text-muted-foreground">Employés présents (se partagent la part employés)</span>
              {employees.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun employé actif.</p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50">
                      <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={parts.includes(emp.id)} onChange={() => toggle(emp.id)} />
                      <span className="truncate">{emp.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {parts.length > 0 && <p className="text-[11px] text-muted-foreground">{parts.length} sélectionné{parts.length > 1 ? 's' : ''}.</p>}
            </div>

            <div className="space-y-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total commande</span><span className="text-lg font-bold text-emerald-400">{money(preview.t)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Part entreprise ({companyPct}%)</span><span className="font-semibold text-violet-400">{money(preview.companyShare)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Part employés ({100 - companyPct}%)</span><span className="font-semibold text-amber-400">{money(preview.employeeShare)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Par employé{preview.n > 0 ? ` (÷${preview.n})` : ''}</span><span className="font-semibold text-amber-400">{money(preview.share)}</span></div>
            </div>
            <Button type="submit" className="w-full" disabled={add.isPending || !canSubmit}><Plus className="h-4 w-4" /> {add.isPending ? 'Enregistrement…' : 'Enregistrer la commande'}</Button>
            <p className="text-[11px] text-muted-foreground">Le partage entreprise / employés est réglable dans les Options du module (⚙️).</p>
          </form>
        )}

        <div className={`rounded-2xl border bg-card p-6 ${canManage && week.offset === 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h3 className="mb-3 text-sm font-semibold">Commandes de la semaine</h3>
          {cargaisons.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Aucune commande" hint={canManage ? 'Enregistre la première commande.' : 'Aucune commande cette semaine.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Date</th>
                    <th className="py-2 text-left font-semibold">Client</th>
                    <th className="py-2 text-left font-semibold">Produit</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                    <th className="py-2 text-right font-semibold">Entreprise</th>
                    <th className="py-2 text-right font-semibold">Employés</th>
                    {canManage && <th className="py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {cargaisons.map((r) => (
                    <tr key={r.id} className="border-b align-top last:border-b-0">
                      <td className="py-2 text-muted-foreground whitespace-nowrap">{fmtDay(r.createdAt)}</td>
                      <td className="py-2 font-medium">{r.clientName || '—'}</td>
                      <td className="py-2">{r.product || '—'}{r.qty > 1 && <span className="text-muted-foreground"> ×{r.qty}</span>}</td>
                      <td className="py-2 text-right text-emerald-400 whitespace-nowrap">{money(r.total)}</td>
                      <td className="py-2 text-right text-violet-400 whitespace-nowrap">{money(r.companyShare)}</td>
                      <td className="py-2 text-right">
                        <div className="text-amber-400 whitespace-nowrap">{money(r.employeeShare)}</div>
                        {r.participants.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {r.participants.map((p, i) => (
                              <span key={i}>{i > 0 ? ', ' : ''}{p.name ?? '—'} ({money(p.share)})</span>
                            ))}
                          </div>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={async () => { if (await confirm({ title: 'Supprimer cette commande ?', message: `${r.clientName || 'Commande'} · ${money(r.total)}`, destructive: true })) del.mutate(r.id); }}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
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

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: typeof PackageCheck; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${accent}`} /> {label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
