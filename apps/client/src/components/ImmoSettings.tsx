import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  getImmoSettings, saveImmoPriceTypes, saveImmoOptions, saveImmoDiscounts,
} from '@/lib/immoSettings';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

type Col = { field: string; label: string; kind: 'text' | 'int' | 'pct'; width?: string; placeholder?: string };
type Row = Record<string, string | number>;

function EditableBlock({
  title, cols, initial, onSave, addLabel, canManage,
}: {
  title: string;
  cols: Col[];
  initial: Row[];
  onSave: (rows: Row[]) => Promise<unknown>;
  addLabel: string;
  canManage: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(initial);
  const save = useMutation({
    mutationFn: () => onSave(rows),
    onSuccess: () => toast('Enregistré.', 'success'),
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const setCell = (i: number, field: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, Object.fromEntries(cols.map((c) => [c.field, c.kind === 'text' ? '' : 0]))]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {canManage && <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4" /> {addLabel}</Button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              {cols.map((c) => <th key={c.field} className="px-3 py-2 text-left font-semibold" style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="px-3 py-4 text-center text-muted-foreground">Aucune ligne. Clique « {addLabel} ».</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b last:border-b-0">
                {cols.map((c) => (
                  <td key={c.field} className="px-3 py-1.5">
                    {c.kind === 'text' ? (
                      <input className={inputCls} value={String(r[c.field] ?? '')} placeholder={c.placeholder} onChange={(e) => setCell(i, c.field, e.target.value)} />
                    ) : (
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" step="1" className={`${inputCls} text-right`} value={String(r[c.field] ?? '')} onChange={(e) => setCell(i, c.field, e.target.value)} />
                        {c.kind === 'pct' && <span className="text-muted-foreground">%</span>}
                      </div>
                    )}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-center">
                  {canManage && <button type="button" onClick={() => delRow(i)} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25"><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <div className="border-t px-5 py-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4" /> {save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      )}
    </div>
  );
}

export function ImmoSettingsPanel({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['immo-settings', companyId], queryFn: () => getImmoSettings(companyId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['immo-settings', companyId] });
  const done = (p: Promise<unknown>) => p.then((r) => { invalidate(); return r; });

  if (q.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  if (!q.data) return <div className="p-4 text-sm text-muted-foreground">Impossible de charger les paramètres.</div>;
  const d = q.data;

  const typeCols: Col[] = [
    { field: 'key', label: 'Identifiant', kind: 'text', placeholder: 'ex. T1 #1 - Shell 9' },
    { field: 'label', label: 'Libellé', kind: 'text', placeholder: 'ex. T1 #1' },
    { field: 'basePrice', label: 'Prix base ($)', kind: 'int', width: '160px' },
  ];
  const optCols: Col[] = [
    { field: 'name', label: 'Nom de l’option', kind: 'text', placeholder: 'ex. Garage' },
    { field: 'pct', label: 'Majoration (%)', kind: 'pct', width: '160px' },
  ];
  const discCols: Col[] = [
    { field: 'name', label: 'Intitulé', kind: 'text', placeholder: 'ex. Réduction étudiant' },
    { field: 'pct', label: 'Pourcentage (%)', kind: 'pct', width: '160px' },
  ];
  const num = (v: string | number | undefined) => Math.round(Number(v) || 0);

  return (
    <div className="space-y-5 p-4">
      <p className="text-xs text-muted-foreground">Ces tarifs et options servent au calcul automatique du prix lors d’une vente ou d’une location. Montants en entiers (pas de centimes).</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <EditableBlock title="Types d’intérieur — Locations" addLabel="Ajouter un type" cols={typeCols} canManage={canManage}
          initial={d.locationTypes.map((t) => ({ key: t.key, label: t.label, basePrice: t.basePrice }))}
          onSave={(rows) => done(saveImmoPriceTypes(companyId, 'location', rows.map((r) => ({ key: String(r.key), label: String(r.label), basePrice: num(r.basePrice) }))))} />
        <EditableBlock title="Types d’intérieur — Ventes" addLabel="Ajouter un type" cols={typeCols} canManage={canManage}
          initial={d.venteTypes.map((t) => ({ key: t.key, label: t.label, basePrice: t.basePrice }))}
          onSave={(rows) => done(saveImmoPriceTypes(companyId, 'vente', rows.map((r) => ({ key: String(r.key), label: String(r.label), basePrice: num(r.basePrice) }))))} />
        <EditableBlock title="Options supplémentaires — Locations" addLabel="Ajouter une option" cols={optCols} canManage={canManage}
          initial={d.locationOptions.map((o) => ({ name: o.name, pct: o.pct }))}
          onSave={(rows) => done(saveImmoOptions(companyId, 'location', rows.map((r) => ({ name: String(r.name), pct: num(r.pct) }))))} />
        <EditableBlock title="Options supplémentaires — Ventes" addLabel="Ajouter une option" cols={optCols} canManage={canManage}
          initial={d.venteOptions.map((o) => ({ name: o.name, pct: o.pct }))}
          onSave={(rows) => done(saveImmoOptions(companyId, 'vente', rows.map((r) => ({ name: String(r.name), pct: num(r.pct) }))))} />
      </div>
      <EditableBlock title="Réductions personnalisées (Locations et Ventes)" addLabel="Ajouter une réduction" cols={discCols} canManage={canManage}
        initial={d.discounts.map((o) => ({ name: o.name, pct: o.pct }))}
        onSave={(rows) => done(saveImmoDiscounts(companyId, rows.map((r) => ({ name: String(r.name), pct: num(r.pct) }))))} />
    </div>
  );
}
