import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fmtMoney } from '@/lib/declarations';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import {
  getAllSubventions,
  decideSubvention,
  deleteSubvention,
  type Subvention,
  type SubventionStatus,
} from '@/lib/subventions';
import { SUB_STATUS, SUB_TYPE_LABEL, Attachments } from '@/pages/Subventions';
import { SearchInput, FilterSelect, distinctOptions } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadCsv } from '@/lib/csv';

const actionBtn =
  'rounded-md border border-input px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50';
const actionBtnDanger =
  'rounded-md border border-input px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50';

export default function IrsSubventions() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['irs-subventions'], queryFn: getAllSubventions });
  const [grants, setGrants] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const decide = useMutation({
    mutationFn: (v: { id: number; status: SubventionStatus; amountGranted?: number | null }) =>
      decideSubvention(v.id, { status: v.status, amountGranted: v.amountGranted }),
    onSuccess: (_data, v) => {
      queryClient.invalidateQueries({ queryKey: ['irs-subventions'] });
      setGrants((g) => {
        const next = { ...g };
        delete next[v.id];
        return next;
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteSubvention(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['irs-subventions'] }),
    onError: () => toast('Échec de la suppression de la demande.', 'error'),
  });

  const list = data ?? [];
  const pending = list.filter((s) => s.status === 'pending').length;
  const granted = list
    .filter((s) => s.status === 'approved' || s.status === 'paid')
    .reduce((sum, s) => sum + (s.amountGranted ?? 0), 0);

  const grantValue = (s: Subvention) =>
    grants[s.id] ?? String(s.amountGranted ?? s.amountRequested);

  const companyOptions = distinctOptions(list.map((s) => s.companyName));
  const statusOptions = (Object.keys(SUB_STATUS) as SubventionStatus[]).map((k) => ({
    value: k,
    label: SUB_STATUS[k].label,
  }));
  const typeOptions = Object.entries(SUB_TYPE_LABEL).map(([value, label]) => ({ value, label }));

  const q = search.trim().toLowerCase();
  const filtered = list.filter((s) => {
    if (q) {
      const hay = `${s.companyName} ${s.motif} ${s.requesterName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (companyFilter && s.companyName !== companyFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (typeFilter && s.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Subventions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Toutes les demandes de subvention des entreprises du serveur.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Demandes</div>
          <div className="text-2xl font-bold">{list.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">En attente</div>
          <div className="text-2xl font-bold text-amber-400">{pending}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total accordé</div>
          <div className="text-2xl font-bold text-primary">{fmtMoney(granted)} $</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher (entreprise, motif, demandeur)…"
          className="flex-1 min-w-[12rem]"
        />
        <FilterSelect
          value={companyFilter}
          onChange={setCompanyFilter}
          options={companyOptions}
          allLabel="Toutes les entreprises"
          ariaLabel="Filtrer par entreprise"
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          allLabel="Tous les statuts"
          ariaLabel="Filtrer par statut"
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
          allLabel="Tous les types"
          ariaLabel="Filtrer par type"
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
                'subventions.csv',
                ['Entreprise', 'Type', 'Motif', 'Demandeur', 'Demandé', 'Accordé', 'Statut'],
                filtered.map((s) => [
                  s.companyName ?? '',
                  SUB_TYPE_LABEL[s.type] ?? s.type,
                  s.motif,
                  s.requesterName,
                  s.amountRequested,
                  s.amountGranted ?? '',
                  SUB_STATUS[s.status].label,
                ]),
              )
            }
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-semibold">Entreprise</th>
                <th className="px-4 py-3 text-left font-semibold">Motif</th>
                <th className="px-4 py-3 text-left font-semibold">Demandeur</th>
                <th className="px-4 py-3 text-right font-semibold">Demandé</th>
                <th className="px-4 py-3 text-right font-semibold">Accordé</th>
                <th className="px-4 py-3 text-left font-semibold">Pièces</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{s.companyName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{s.motif}</span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {SUB_TYPE_LABEL[s.type] ?? s.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.requesterName}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(s.amountRequested)} $</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={grantValue(s)}
                      onChange={(e) => setGrants((g) => ({ ...g, [s.id]: e.target.value }))}
                      className="h-8 w-28 rounded-md border border-input bg-background px-2 text-right text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Attachments photoUrl={s.photoUrl} documents={s.documents} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${SUB_STATUS[s.status].cls}`}
                    >
                      {SUB_STATUS[s.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {s.status !== 'approved' && s.status !== 'paid' && (
                        <button
                          className={actionBtn}
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              id: s.id,
                              status: 'approved',
                              amountGranted: Number(grantValue(s)) || s.amountRequested,
                            })
                          }
                        >
                          Accorder
                        </button>
                      )}
                      {s.status !== 'paid' && (
                        <button
                          className={actionBtn}
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              id: s.id,
                              status: 'paid',
                              amountGranted: Number(grantValue(s)) || s.amountRequested,
                            })
                          }
                        >
                          Verser
                        </button>
                      )}
                      {s.status !== 'rejected' && (
                        <button
                          className={actionBtn}
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: s.id, status: 'rejected' })}
                        >
                          Refuser
                        </button>
                      )}
                      {s.status !== 'pending' && (
                        <button
                          className={actionBtn}
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: s.id, status: 'pending', amountGranted: null })}
                        >
                          Rouvrir
                        </button>
                      )}
                      <button
                        className={actionBtnDanger}
                        disabled={remove.isPending}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: 'Supprimer cette demande ?',
                              message: `« ${s.motif} » — ${s.companyName}. Cette action est définitive.`,
                              destructive: true,
                            })
                          )
                            remove.mutate(s.id);
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                    Aucune demande de subvention.
                  </td>
                </tr>
              )}
              {list.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-muted-foreground">
                    Aucun résultat pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
