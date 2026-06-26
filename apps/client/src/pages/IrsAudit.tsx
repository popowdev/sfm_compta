import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput, FilterSelect, distinctOptions } from '@/components/ui/filters';
import { downloadCsv } from '@/lib/csv';
import { getAudit } from '@/lib/audit';

const ACTION_LABEL: Record<string, string> = {
  subvention_approved: 'Subvention accordée',
  subvention_paid: 'Subvention versée',
  subvention_rejected: 'Subvention refusée',
  subvention_pending: 'Subvention rouverte',
  subvention_delete: 'Subvention supprimée',
  irs_grant: 'Rôle IRS accordé',
  irs_revoke: 'Rôle IRS retiré',
  whitelist_on: 'Accès activé',
  whitelist_off: 'Accès désactivé',
  user_delete: 'Compte supprimé',
};
const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function IrsAudit() {
  const q = useQuery({ queryKey: ['audit'], queryFn: getAudit });
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const list = q.data?.entries ?? [];
  const actionOptions = distinctOptions(list.map((e) => e.action)).map((o) => ({
    value: o.value,
    label: actionLabel(o.value),
  }));

  const term = search.trim().toLowerCase();
  const filtered = list.filter((e) => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (term) {
      const hay = `${e.actorName} ${actionLabel(e.action)} ${e.targetLabel ?? ''} ${e.detail ?? ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Journal d'audit</h1>
      <p className="mt-1 text-sm text-muted-foreground">Historique des actions des agents IRS / Staff.</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher (acteur, cible, détail)…"
          className="flex-1 min-w-[12rem] sm:w-64 sm:flex-none"
        />
        <FilterSelect
          value={actionFilter}
          onChange={setActionFilter}
          options={actionOptions}
          allLabel="Toutes les actions"
          ariaLabel="Filtrer par action"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </span>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                'journal-audit.csv',
                ['Date', 'Acteur', 'Action', 'Cible', 'Détail'],
                filtered.map((e) => [
                  fmtDateTime(e.createdAt),
                  e.actorName,
                  actionLabel(e.action),
                  e.targetLabel ?? '',
                  e.detail ?? '',
                ]),
              )
            }
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {q.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={ScrollText} title="Aucune action enregistrée" hint="Les actions des agents apparaîtront ici." />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Acteur</th>
                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                    <th className="px-4 py-3 text-left font-semibold">Cible</th>
                    <th className="px-4 py-3 text-left font-semibold">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-muted-foreground">
                        Aucun résultat pour ces filtres.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((e) => (
                      <tr key={e.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                        <td className="px-4 py-3 font-medium">{e.actorName}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{actionLabel(e.action)}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.targetLabel ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.detail ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
