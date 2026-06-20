import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES, EMPLOYEE_POSITIONS } from '@rp-compta/shared';
import { fmtMoney } from '@/lib/declarations';
import { getCompanyStats } from '@/lib/stats';
import { BarList } from '@/components/StatBars';

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);
const POS_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

export default function Stats() {
  const { id } = useParams();
  const companyId = Number(id);
  const { data, isLoading } = useQuery({
    queryKey: ['stats', companyId],
    queryFn: () => getCompanyStats(companyId),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Chargement des statistiques…</div>;
  }

  const { fiscal, expenses, subventions, hr } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="CA net (cumul)" value={`${fmtMoney(fiscal.caNet)} $`} />
        <Kpi label="Bénéfice" value={`${fmtMoney(fiscal.benefit)} $`} accent="text-primary" />
        <Kpi label="Impôts" value={`${fmtMoney(fiscal.totalTax)} $`} accent="text-amber-400" />
        <Kpi label="Dépenses" value={`${fmtMoney(expenses.total)} $`} accent="text-destructive" />
        <Kpi label="Subv. accordées" value={`${fmtMoney(subventions.granted)} $`} accent="text-emerald-400" />
        <Kpi label="Employés actifs" value={`${hr.active}`} />
      </div>

      <Section title="Fiscalité — CA net par semaine déclarée">
        <BarList
          items={fiscal.weekly.map((w) => ({
            label: w.weekLabel,
            value: w.caNet,
            hint: `bénéf. ${fmtMoney(w.benefit)} $ · impôt ${fmtMoney(w.totalTax)} $`,
          }))}
          unit=" $"
          format={fmtMoney}
          emptyLabel="Aucune déclaration."
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Dépenses par catégorie">
          <BarList
            items={expenses.byCategory
              .map((c) => ({ label: CAT_LABEL[c.category] ?? c.category, value: c.total }))
              .sort((a, b) => b.value - a.value)}
            unit=" $"
            format={fmtMoney}
            barClass="bg-destructive/60"
            emptyLabel="Aucune dépense."
          />
          {expenses.total > 0 && (
            <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Dont déductible : {fmtMoney(expenses.deductible)} $ sur {fmtMoney(expenses.total)} $
            </div>
          )}
        </Section>

        <Section title="Effectif par poste (actifs)">
          <BarList
            items={hr.byPosition
              .map((p) => ({ label: POS_LABEL[p.position] ?? p.position, value: p.count }))
              .sort((a, b) => b.value - a.value)}
            barClass="bg-primary/60"
            emptyLabel="Aucun employé actif."
          />
          {hr.count > 0 && (
            <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              {hr.active} actifs sur {hr.count} · masse horaire {fmtMoney(hr.hourlyTotal)} $/h
            </div>
          )}
        </Section>
      </div>

      <Section title="Subventions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Demandes" value={`${subventions.count}`} />
          <Kpi label="En attente" value={`${subventions.pending}`} accent="text-amber-400" />
          <Kpi label="Demandé (cumul)" value={`${fmtMoney(subventions.requested)} $`} />
          <Kpi label="Accordé" value={`${fmtMoney(subventions.granted)} $`} accent="text-emerald-400" />
        </div>
      </Section>
    </div>
  );
}
