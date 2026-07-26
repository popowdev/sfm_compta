import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllDeclarations,
  setDeclarationStatus,
  archiveDeclaration,
  restoreDeclaration,
  purgeDeclaration,
  fmtMoney,
  type Declaration,
} from '@/lib/declarations';
import { SearchInput, FilterSelect, distinctOptions } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Download, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { downloadCsv } from '@/lib/csv';

const STATUS: Record<Declaration['status'], { label: string; cls: string }> = {
  submitted: { label: 'soumise', cls: 'bg-amber-500/10 text-amber-400' },
  paid: { label: 'payée', cls: 'bg-primary/10 text-primary' },
  cancelled: { label: 'annulée', cls: 'bg-destructive/10 text-destructive' },
};

const actionBtn =
  'inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50';

type Tab = 'active' | 'archived';

export default function IrsDeclarations() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('active');

  const active = useQuery({ queryKey: ['irs-declarations'], queryFn: () => getAllDeclarations(false) });
  const archived = useQuery({
    queryKey: ['irs-declarations-archived'],
    queryFn: () => getAllDeclarations(true),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['irs-declarations'] });
    queryClient.invalidateQueries({ queryKey: ['irs-declarations-archived'] });
  };

  const setStatus = useMutation({
    mutationFn: (v: { id: number; status: Declaration['status'] }) =>
      setDeclarationStatus(v.id, v.status),
    onSuccess: invalidate,
    onError: () => toast('Échec de la mise à jour du statut.', 'error'),
  });
  const archiveM = useMutation({
    mutationFn: archiveDeclaration,
    onSuccess: invalidate,
    onError: () => toast("Échec de l'archivage.", 'error'),
  });
  const restoreM = useMutation({
    mutationFn: restoreDeclaration,
    onSuccess: invalidate,
    onError: (err) => {
      const code = err instanceof Error ? err.message : '';
      toast(
        code === 'week_active_exists'
          ? 'Une déclaration active existe déjà pour cette semaine — impossible de restaurer.'
          : 'Échec de la restauration.',
        'error',
      );
    },
  });
  const purgeM = useMutation({
    mutationFn: purgeDeclaration,
    onSuccess: invalidate,
    onError: () => toast('Échec de la suppression.', 'error'),
  });

  const activeList = active.data ?? [];
  const archivedList = archived.data ?? [];
  const list = tab === 'archived' ? archivedList : activeList;

  const totalTax = activeList
    .filter((d) => d.status !== 'cancelled')
    .reduce((s, d) => s + d.totalTax, 0);
  const pending = activeList.filter((d) => d.status === 'submitted').length;

  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatusFilter] = useState('');

  const companyOptions = distinctOptions(list.map((d) => d.companyName));
  const statusOptions = (Object.keys(STATUS) as Declaration['status'][]).map((s) => ({
    value: s,
    label: STATUS[s].label,
  }));

  const q = search.trim().toLowerCase();
  const filtered = list.filter((d) => {
    if (company && d.companyName !== company) return false;
    if (status && d.status !== status) return false;
    if (q) {
      const hay = `${d.companyName} ${d.weekLabel} ${d.declarantName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const busy = setStatus.isPending || archiveM.isPending || restoreM.isPending || purgeM.isPending;

  const tabBtn = (t: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(t)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
    </button>
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Déclarations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Toutes les déclarations des entreprises du serveur.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Déclarations actives</div>
          <div className="text-2xl font-bold">{activeList.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">En attente</div>
          <div className="text-2xl font-bold text-amber-400">{pending}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Impôts (hors annulées)</div>
          <div className="text-2xl font-bold text-primary">{fmtMoney(totalTax)} $</div>
        </div>
      </div>

      <div className="mt-6 inline-flex gap-1 rounded-lg border bg-muted/40 p-1">
        {tabBtn('active', 'Actives', activeList.length)}
        {tabBtn('archived', 'Archivées', archivedList.length)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher (entreprise, semaine, déclarant)…"
          className="flex-1 min-w-[12rem] sm:w-64 sm:flex-none"
        />
        <FilterSelect
          value={company}
          onChange={setCompany}
          options={companyOptions}
          allLabel="Toutes les entreprises"
          ariaLabel="Filtrer par entreprise"
        />
        <FilterSelect
          value={status}
          onChange={setStatusFilter}
          options={statusOptions}
          allLabel="Tous les statuts"
          ariaLabel="Filtrer par statut"
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
                tab === 'archived' ? 'declarations-archivees.csv' : 'declarations.csv',
                ['Entreprise', 'Semaine', 'Déclarant', 'CA net', 'Bénéfice', 'Impôt société', 'Impôt dividendes', 'Impôt total', 'Statut'],
                filtered.map((d) => [
                  d.companyName ?? '',
                  d.weekLabel,
                  d.declarantName,
                  d.caNet,
                  d.benefit,
                  d.corporateTax,
                  d.dividendTax,
                  d.totalTax,
                  STATUS[d.status].label,
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
                <th className="px-4 py-3 text-left font-semibold">Semaine</th>
                <th className="px-4 py-3 text-left font-semibold">Déclarant</th>
                <th className="px-4 py-3 text-right font-semibold">CA NET</th>
                <th className="px-4 py-3 text-right font-semibold">Bénéfice</th>
                <th className="px-4 py-3 text-right font-semibold">Impôt soc.</th>
                <th className="px-4 py-3 text-right font-semibold">Impôt div.</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{d.companyName}</td>
                  <td className="px-4 py-3">{d.weekLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.declarantName}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(d.caNet)} $</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(d.benefit)} $</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(d.corporateTax)} $</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(d.dividendTax)} $</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoney(d.totalTax)} $</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[d.status].cls}`}>
                      {STATUS[d.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {tab === 'active' ? (
                        <>
                          {d.status !== 'paid' && (
                            <button
                              className={actionBtn}
                              disabled={busy}
                              onClick={() => setStatus.mutate({ id: d.id, status: 'paid' })}
                            >
                              Payer
                            </button>
                          )}
                          {d.status !== 'cancelled' && (
                            <button
                              className={actionBtn}
                              disabled={busy}
                              onClick={() => setStatus.mutate({ id: d.id, status: 'cancelled' })}
                            >
                              Annuler
                            </button>
                          )}
                          {d.status !== 'submitted' && (
                            <button
                              className={actionBtn}
                              disabled={busy}
                              onClick={() => setStatus.mutate({ id: d.id, status: 'submitted' })}
                            >
                              Rouvrir
                            </button>
                          )}
                          <button
                            className={actionBtn}
                            disabled={busy}
                            title="Archiver"
                            onClick={() => archiveM.mutate(d.id)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archiver
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={actionBtn}
                            disabled={busy}
                            onClick={() => restoreM.mutate(d.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurer
                          </button>
                          <button
                            className={`${actionBtn} border-destructive/40 text-destructive hover:bg-destructive/10`}
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Supprimer définitivement la déclaration de ${d.companyName} (${d.weekLabel}) ? Cette action est irréversible.`,
                                )
                              )
                                purgeM.mutate(d.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-muted-foreground">
                    {tab === 'archived' ? 'Aucune déclaration archivée.' : 'Aucune déclaration.'}
                  </td>
                </tr>
              )}
              {list.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-muted-foreground">
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
