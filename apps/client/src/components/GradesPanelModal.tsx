import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { MODULES, type ModuleKey } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import {
  getMyGrades,
  createMyGrade,
  patchMyGrade,
  deleteMyGrade,
  setMyGradePermission,
} from '@/lib/grades';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));
const ACTIONS: { key: 'canView' | 'canCreate' | 'canEdit' | 'canDelete'; label: string }[] = [
  { key: 'canView', label: 'Voir' },
  { key: 'canCreate', label: 'Créer' },
  { key: 'canEdit', label: 'Modifier' },
  { key: 'canDelete', label: 'Supprimer' },
];

export function GradesPanelModal({
  companyId,
  open,
  onClose,
}: {
  companyId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['my-grades', companyId], queryFn: () => getMyGrades(companyId), enabled: open });
  const [selected, setSelected] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const grades = q.data?.grades ?? [];
  const modules = (q.data?.modules ?? []).filter((m) => COMPANY_PAGE_KEYS.has(m.key));

  useEffect(() => {
    const first = grades[0];
    if (open && first && (selected === null || !grades.some((g) => g.id === selected))) {
      setSelected(first.id);
    }
  }, [open, grades, selected]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-grades', companyId] });
    queryClient.invalidateQueries({ queryKey: ['my-companies'] });
  };

  const create = useMutation({
    mutationFn: () => createMyGrade(companyId, newName.trim()),
    onSuccess: () => {
      setNewName('');
      refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (v: { rid: number; body: { name?: string; canManage?: boolean } }) =>
      patchMyGrade(companyId, v.rid, v.body),
    onSuccess: refresh,
    onError: () => alert('Au moins un grade doit rester « gérant ».'),
  });
  const remove = useMutation({
    mutationFn: (rid: number) => deleteMyGrade(companyId, rid),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
    onError: () => alert('Impossible : des membres sont encore assignés à ce grade.'),
  });
  const setPerm = useMutation({
    mutationFn: (v: {
      rid: number;
      key: ModuleKey;
      perm: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
    }) => setMyGradePermission(companyId, v.rid, v.key, v.perm),
    onSuccess: refresh,
  });

  if (!open) return null;
  const grade = grades.find((g) => g.id === selected) ?? null;

  const toggle = (key: ModuleKey, action: (typeof ACTIONS)[number]['key']) => {
    if (!grade) return;
    const cur = grade.permissions[key] ?? { canView: false, canCreate: false, canEdit: false, canDelete: false };
    const next = {
      canView: cur.canView,
      canCreate: cur.canCreate,
      canEdit: cur.canEdit,
      canDelete: cur.canDelete,
    };
    next[action] = !next[action];
    if (next.canCreate || next.canEdit || next.canDelete) next.canView = true;
    if (action === 'canView' && !next.canView) {
      next.canCreate = next.canEdit = next.canDelete = false;
    }
    setPerm.mutate({ rid: grade.id, key, perm: next });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Grades & permissions</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          {grades.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelected(g.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                g.id === selected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {g.name}
              {g.canManage && <ShieldCheck className="h-3.5 w-3.5" />}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nouveau grade"
              className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => newName.trim() && create.mutate()}
              disabled={!newName.trim() || create.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {grade ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={grade.canManage}
                    onChange={() => patch.mutate({ rid: grade.id, body: { canManage: !grade.canManage } })}
                  />
                  <span>Grade « gérant » (paramètres, soldes, grades)</span>
                </label>
                {!grade.isDefault && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer le grade ${grade.name} ?`)) remove.mutate(grade.id);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive/80 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer ce grade
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 text-left font-semibold">Module</th>
                      {ACTIONS.map((a) => (
                        <th key={a.key} className="px-3 py-2 text-center font-semibold">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((m, i) => {
                      const perm = grade.permissions[m.key] ?? {
                        canView: false,
                        canCreate: false,
                        canEdit: false,
                        canDelete: false,
                      };
                      return (
                        <tr key={m.key} className={i > 0 ? 'border-t' : ''}>
                          <td className="px-4 py-2 font-medium">{m.label}</td>
                          {ACTIONS.map((a) => (
                            <td key={a.key} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-input accent-primary"
                                checked={perm[a.key]}
                                disabled={setPerm.isPending}
                                onChange={() => toggle(m.key, a.key)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Créer / Modifier / Supprimer activent automatiquement « Voir ». Le Staff et les
                grades « gérant » ont accès complet.
              </p>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Aucun grade.</div>
          )}
        </div>
      </div>
    </div>
  );
}
