import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { EMPLOYEE_POSITIONS, type EmployeePosition } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { getSalaryGrid, saveSalaryGrid, type SalaryGridRow } from '@/lib/salary';

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
  const q = useQuery({ queryKey: ['salary-grid', companyId], queryFn: () => getSalaryGrid(companyId) });
  const [rows, setRows] = useState<Record<string, { hourlyRate: string; baseSalary: string }>>({});

  useEffect(() => {
    if (open && q.data) {
      const next: Record<string, { hourlyRate: string; baseSalary: string }> = {};
      for (const r of q.data.grid) {
        next[r.position] = { hourlyRate: String(r.hourlyRate), baseSalary: String(r.baseSalary) };
      }
      setRows(next);
    }
  }, [open, q.data]);

  const save = useMutation({
    mutationFn: () => {
      const grid: SalaryGridRow[] = EMPLOYEE_POSITIONS.map((p) => ({
        position: p.key as EmployeePosition,
        hourlyRate: Number(rows[p.key]?.hourlyRate) || 0,
        baseSalary: Number(rows[p.key]?.baseSalary) || 0,
      }));
      return saveSalaryGrid(companyId, grid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-grid', companyId] });
      onClose();
    },
  });

  if (!open) return null;
  const canWrite = q.data?.canWrite ?? false;
  const set = (pos: string, k: 'hourlyRate' | 'baseSalary', v: string) =>
    setRows((r) => ({ ...r, [pos]: { ...{ hourlyRate: '', baseSalary: '' }, ...r[pos], [k]: v } }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Grille salariale par poste</h2>
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
            Le taux défini ici pré-remplit la fiche d'un nouvel employé de ce poste (modifiable ensuite).
          </p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Poste</th>
                  <th className="px-3 py-2 text-left font-semibold">Taux ($/h)</th>
                  <th className="px-3 py-2 text-left font-semibold">Salaire base ($)</th>
                </tr>
              </thead>
              <tbody>
                {EMPLOYEE_POSITIONS.map((p, i) => (
                  <tr key={p.key} className={i > 0 ? 'border-t' : ''}>
                    <td className="px-3 py-2 font-medium">{p.label}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canWrite}
                        className={inputCls}
                        value={rows[p.key]?.hourlyRate ?? ''}
                        onChange={(e) => set(p.key, 'hourlyRate', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canWrite}
                        className={inputCls}
                        value={rows[p.key]?.baseSalary ?? ''}
                        onChange={(e) => set(p.key, 'baseSalary', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && (
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
