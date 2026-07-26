import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSalaryGrid, saveSalaryGrid } from '@/lib/salary';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export function SalaryGridModal({
  companyId,
  open,
  onClose,
}: {
  companyId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['salary-grid', companyId], queryFn: () => getSalaryGrid(companyId) });
  const [rows, setRows] = useState<Record<number, { hourlyRate: string; baseSalary: string }>>({});
  const seeded = useRef(false);

  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (q.data && !seeded.current) {
      seeded.current = true;
      const next: Record<number, { hourlyRate: string; baseSalary: string }> = {};
      for (const r of q.data.grid) {
        next[r.companyRoleId] = { hourlyRate: String(r.hourlyRate), baseSalary: String(r.baseSalary) };
      }
      setRows(next);
    }
  }, [open, q.data]);

  const grades = q.data?.grid ?? [];
  const save = useMutation({
    mutationFn: () =>
      saveSalaryGrid(
        companyId,
        grades.map((g) => ({
          companyRoleId: g.companyRoleId,
          hourlyRate: Number(rows[g.companyRoleId]?.hourlyRate) || 0,
          baseSalary: Number(rows[g.companyRoleId]?.baseSalary) || 0,
        })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-grid', companyId] });
      onClose();
    },
    onError: () => toast('Échec de l\'enregistrement de la grille salariale.', 'error'),
  });

  if (!open) return null;
  const canWrite = q.data?.canWrite ?? false;
  const set = (roleId: number, k: 'hourlyRate' | 'baseSalary', v: string) =>
    setRows((r) => ({ ...r, [roleId]: { ...{ hourlyRate: '', baseSalary: '' }, ...r[roleId], [k]: v } }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Grille salariale par grade</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-4 text-xs text-muted-foreground">
            Taux horaire + salaire de base par grade. Sert au calcul de la paie (base + heures × taux). Les grades
            proviennent de la synchro FiveM.
          </p>
          {q.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ) : q.isError ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <p>Impossible de charger la grille salariale.</p>
              <Button type="button" variant="outline" className="mt-3" onClick={() => q.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : q.isSuccess && grades.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun grade pour cette entreprise. Les grades se créent automatiquement via la synchro FiveM (ou à la
              main dans les paramètres de l'entreprise).
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">Grade</th>
                    <th className="px-3 py-2 text-left font-semibold">Taux ($/h)</th>
                    <th className="px-3 py-2 text-left font-semibold">Salaire base ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g, i) => (
                    <tr key={g.companyRoleId} className={i > 0 ? 'border-t' : ''}>
                      <td className="px-3 py-2 font-medium">{g.gradeName}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={!canWrite}
                          className={inputCls}
                          value={rows[g.companyRoleId]?.hourlyRate ?? ''}
                          onChange={(e) => set(g.companyRoleId, 'hourlyRate', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={!canWrite}
                          className={inputCls}
                          value={rows[g.companyRoleId]?.baseSalary ?? ''}
                          onChange={(e) => set(g.companyRoleId, 'baseSalary', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canWrite && grades.length > 0 && (
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Fermer
              </Button>
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
