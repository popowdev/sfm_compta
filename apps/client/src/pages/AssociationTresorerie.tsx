import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Wallet, TrendingUp, TrendingDown, Coins } from 'lucide-react';
import { ASSOCIATION_TX_TYPES, type AssociationTxType } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { AssocPage } from '@/components/AssocPage';
import { fmtMoney } from '@/lib/declarations';
import {
  getAssociationTransactions,
  addAssociationTransaction,
  deleteAssociationTransaction,
} from '@/lib/associations';

const TX_LABEL: Record<string, string> = Object.fromEntries(ASSOCIATION_TX_TYPES.map((t) => [t.key, t.label]));
const TX_DIR: Record<string, 'in' | 'out'> = Object.fromEntries(ASSOCIATION_TX_TYPES.map((t) => [t.key, t.dir]));
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function fmtDate(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR', { dateStyle: 'short' });
}

function TreasuryBody({ associationId, initialBalance }: { associationId: number; initialBalance: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({
    queryKey: ['association-transactions', associationId],
    queryFn: () => getAssociationTransactions(associationId),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['association-transactions', associationId] });
    queryClient.invalidateQueries({ queryKey: ['association'] });
  };

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AssociationTxType>('cotisation');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  const add = useMutation({
    mutationFn: () => addAssociationTransaction(associationId, { type, label: label.trim(), amount: Number(amount) || 0 }),
    onSuccess: () => {
      setOpen(false);
      setType('cotisation');
      setLabel('');
      setAmount('');
      invalidate();
    },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (tid: number) => deleteAssociationTransaction(associationId, tid),
    onSuccess: invalidate,
    onError: () => toast('Échec de la suppression.', 'error'),
  });

  const canManage = q.data?.canManage ?? false;
  const txs = q.data?.transactions ?? [];
  const balance = q.data?.balance ?? initialBalance;
  const credits = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const debits = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const amountValid = label.trim().length > 0 && amount !== '' && Number(amount) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Kpi icon={Wallet} label="Solde" value={`${fmtMoney(balance)} $`} accent={balance >= 0 ? 'text-primary' : 'text-destructive'} />
          <Kpi icon={TrendingUp} label="Entrées" value={`${fmtMoney(credits)} $`} accent="text-emerald-400" />
          <Kpi icon={TrendingDown} label="Sorties" value={`${fmtMoney(Math.abs(debits))} $`} accent="text-amber-400" />
        </div>
        {canManage && (
          <Button className="ml-auto" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Mouvement
          </Button>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : txs.length === 0 ? (
        <EmptyState icon={Coins} title="Aucun mouvement" hint="Cotisations, dons, subventions et dépenses apparaîtront ici." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Libellé</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Montant</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold"></th>}
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-b last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      {t.label}
                      {t.createdByName && <div className="text-xs text-muted-foreground">{t.createdByName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{TX_LABEL[t.type] ?? t.type}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${t.amount >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                      {t.amount >= 0 ? '+' : ''}
                      {fmtMoney(t.amount)} $
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            if (await confirm({ title: 'Supprimer ce mouvement ?', message: t.label, destructive: true })) remove.mutate(t.id);
                          }}
                          title="Supprimer"
                          aria-label={`Supprimer ${t.label}`}
                          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouveau mouvement</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (amountValid && !add.isPending) add.mutate();
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Type</span>
                <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as AssociationTxType)}>
                  {ASSOCIATION_TX_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} {t.dir === 'out' ? '(sortie)' : '(entrée)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Libellé</span>
                <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. cotisations janvier" autoFocus />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Montant ($)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {TX_DIR[type] === 'out' ? 'Sera décompté du solde.' : 'Sera ajouté au solde.'}
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={!amountValid || add.isPending}>
                  {add.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssociationTresorerie() {
  return (
    <AssocPage title="Trésorerie">
      {(d) => <TreasuryBody associationId={d.association.id} initialBalance={d.balance} />}
    </AssocPage>
  );
}
