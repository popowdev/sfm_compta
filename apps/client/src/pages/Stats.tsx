import { useCompany } from '@/lib/useCompany';
import { useQuery } from '@tanstack/react-query';
import {
  EXPENSE_CATEGORIES,
  EMPLOYEE_POSITIONS,
  PAYMENT_METHODS,
} from '@rp-compta/shared';
import {
  ShoppingCart,
  TrendingUp,
  Receipt,
  Coins,
  HandCoins,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { fmtMoney, fmtInt } from '@/lib/declarations';
import { getCompanyStats } from '@/lib/stats';

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);
const POS_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYEE_POSITIONS.map((p) => [p.key, p.label]),
);
const PAY_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.key, p.label]),
);

const PALETTE = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#64748b'];
const AXIS = 'rgba(148,163,184,0.6)';
const GRID = 'rgba(148,163,184,0.15)';

const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
};
const money = (v: number | string) => `${fmtMoney(Number(v))} $`;
const fmtDay = (d: string) => {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${accent ?? 'text-muted-foreground'}`} />
      </div>
      <div className={`mt-2 text-xl font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      {subtitle && <div className="mb-3 text-xs text-muted-foreground">{subtitle}</div>}
      {empty ? (
        <div className="grid h-44 place-items-center text-sm text-muted-foreground">
          Pas encore de données.
        </div>
      ) : (
        <div className={subtitle ? '' : 'mt-3'}>{children}</div>
      )}
    </div>
  );
}

export default function Stats() {
  const { companyId } = useCompany();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stats', companyId],
    queryFn: () => getCompanyStats(companyId),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Chargement des statistiques…</div>;
  }

  if (isError || !data) {
    return (
      <div className="grid place-items-center gap-3 py-12 text-sm text-muted-foreground">
        <div>Impossible de charger les statistiques.</div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const { fiscal, expenses, subventions, hr, sales } = data;

  const expenseData = expenses.byCategory
    .map((c) => ({ name: CAT_LABEL[c.category] ?? c.category, value: c.total }))
    .sort((a, b) => b.value - a.value);
  const payData = sales.byPayment.map((p) => ({ name: PAY_LABEL[p.method] ?? p.method, value: p.total }));
  const posData = hr.byPosition
    .map((p) => ({ name: POS_LABEL[p.position] ?? p.position, count: p.count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="CA ventes" value={money(sales.total)} icon={ShoppingCart} accent="text-primary" />
        <Kpi label="Marge ventes" value={money(sales.margin)} icon={TrendingUp} accent="text-emerald-400" />
        <Kpi label="Bénéfice fiscal" value={money(fiscal.benefit)} icon={Coins} />
        <Kpi label="Dépenses" value={money(expenses.total)} icon={Receipt} accent="text-destructive" />
        <Kpi label="Subv. accordées" value={money(subventions.granted)} icon={HandCoins} accent="text-emerald-400" />
        <Kpi label="Employés actifs" value={`${hr.active}`} icon={Users} />
      </div>

      <Card
        title="Chiffre d'affaires — 30 derniers jours"
        subtitle={`${sales.count} vente(s) · ${money(sales.total)} encaissés`}
        empty={sales.total === 0}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={sales.byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: AXIS }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: AXIS }} width={48} tickFormatter={(v) => `${v}`} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} formatter={(v) => [money(v as number), 'CA']} />
            <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} fill="url(#caGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top articles (CA)" empty={sales.topProducts.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(180, sales.topProducts.length * 34)}>
            <BarChart
              data={sales.topProducts.map((p) => ({ name: p.name, value: p.revenue }))}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: AXIS }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(v as number), 'CA']} cursor={{ fill: GRID }} />
              <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Ventes par employé" empty={sales.byEmployee.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(180, sales.byEmployee.length * 34)}>
            <BarChart
              data={sales.byEmployee.map((e) => ({ name: e.name, value: e.total }))}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: AXIS }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(v as number), 'CA']} cursor={{ fill: GRID }} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Répartition des paiements" empty={payData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={payData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {payData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [money(v as number), n as string]} />
            </PieChart>
          </ResponsiveContainer>
          <Legend2 items={payData.map((d, i) => ({ label: d.name, color: PALETTE[i % PALETTE.length] ?? '#64748b', value: money(d.value) }))} />
        </Card>

        <Card title="Dépenses par catégorie" empty={expenseData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {expenseData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [money(v as number), n as string]} />
            </PieChart>
          </ResponsiveContainer>
          <Legend2 items={expenseData.map((d, i) => ({ label: d.name, color: PALETTE[i % PALETTE.length] ?? '#64748b', value: money(d.value) }))} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Fiscalité — CA net par semaine déclarée" empty={fiscal.weekly.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={fiscal.weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: AXIS }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} width={48} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [money(v as number), n === 'caNet' ? 'CA net' : n === 'benefit' ? 'Bénéfice' : 'Impôt']} cursor={{ fill: GRID }} />
              <Bar dataKey="caNet" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalTax" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Effectif par poste (actifs)" empty={posData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={posData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} width={36} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Employés']} cursor={{ fill: GRID }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 text-xs text-muted-foreground">
            {hr.active} actifs sur {hr.count} · masse horaire {fmtInt(hr.hourlyTotal)} $/h
          </div>
        </Card>
      </div>
    </div>
  );
}

function Legend2({ items }: { items: { label: string; color: string; value: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          <span className="text-muted-foreground">{it.label}</span>
          <span className="font-medium">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
