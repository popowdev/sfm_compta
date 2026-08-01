import { useCompany } from '@/lib/useCompany';
import { useQuery } from '@tanstack/react-query';
import { Wallet, Clock, Car, ShoppingCart, Wrench, Gem, Truck, CheckCircle2, Circle } from 'lucide-react';
import { fmtInt } from '@/lib/declarations';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getMyPay, type MyPayWeek } from '@/lib/mypay';

const money = (n: number) => `${fmtInt(n)} $`;
const fmtRange = (a: string, b: string) => `${new Date(a).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} → ${new Date(b).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`;

function Line({ label, value, icon: Icon, accent }: { label: string; value: string; icon?: typeof Wallet; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />} {label}</span>
      <span className={`font-medium ${accent ?? ''}`}>{value}</span>
    </div>
  );
}

function WeekCard({ w, current }: { w: MyPayWeek; current?: boolean }) {
  const rows: { label: string; value: number; icon: typeof Wallet; accent: string }[] = [
    { label: `Salaire de base (${w.cappedHours.toLocaleString('fr-FR')} h)`, value: w.base, icon: Clock, accent: '' },
    { label: `Commission ventes (${w.salesCount})`, value: w.caisseCommission, icon: ShoppingCart, accent: '' },
    { label: `Commission garage (${w.garageCount})`, value: w.garageCommission, icon: Wrench, accent: '' },
    { label: `Commission taxi (${w.coursesCount} course${w.coursesCount > 1 ? 's' : ''})`, value: w.taxiCommission, icon: Car, accent: 'text-amber-400' },
    { label: `Commission pawnshop`, value: w.pawnshopCommission, icon: Gem, accent: '' },
    { label: `Runs (${w.runsCount})`, value: w.runsCommission, icon: Truck, accent: '' },
    { label: `Prime de pointe`, value: w.peakBonus, icon: Wallet, accent: 'text-violet-400' },
    { label: `Prime`, value: w.bonus, icon: Wallet, accent: '' },
  ].filter((r) => r.value !== 0);

  return (
    <div className={`rounded-xl border bg-card p-5 ${current ? 'border-primary/40' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{current ? 'Semaine en cours' : w.label}</div>
          <div className="text-xs text-muted-foreground">{fmtRange(w.startDate, w.endDate)}{w.status === 'closed' ? ' · gelée' : ''}</div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${w.isPaid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
          {w.isPaid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          {w.isPaid ? 'Payé' : 'À payer'}
        </span>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((r) => <Line key={r.label} label={r.label} value={money(r.value)} icon={r.icon} accent={r.accent} />)}
        {w.deductions > 0 && <Line label="Retenue" value={`- ${money(w.deductions)}`} accent="text-destructive" />}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-sm font-semibold">Total à percevoir</span>
        <span className="text-xl font-bold text-emerald-400">{money(w.paid)}</span>
      </div>
    </div>
  );
}

export default function MaPaie() {
  const { companyId, isLoading } = useCompany();
  const q = useQuery({ queryKey: ['my-pay', companyId], queryFn: () => getMyPay(companyId), enabled: !!companyId });

  if (isLoading || q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!q.data) return <EmptyState icon={Wallet} title="Ma paie" hint="Indisponible." />;
  if (!q.data.hasFiche) return <EmptyState icon={Wallet} title="Aucune fiche employé" hint="Ton compte n'est pas encore lié à une fiche RH dans cette entreprise. Demande à ton patron de créer ta fiche." />;

  const { employee, weeks } = q.data;
  const current = weeks[0];
  const previous = weeks.slice(1);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{employee?.name}</h2>
            <p className="text-sm text-muted-foreground">{employee?.gradeName ?? '—'} · commission {employee?.commissionRate.toFixed(0)} %</p>
          </div>
          {employee?.iban && <div className="text-right text-xs text-muted-foreground">IBAN<br /><span className="font-mono text-sm text-foreground">{employee.iban}</span></div>}
        </div>
      </div>

      {weeks.length === 0 ? (
        <EmptyState icon={Wallet} title="Aucune semaine" hint="Aucun exercice hebdomadaire pour l'instant." />
      ) : (
        <>
          {current && <WeekCard w={current} current />}
          {previous.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Semaines précédentes</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {previous.map((w) => <WeekCard key={w.exerciceId} w={w} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
