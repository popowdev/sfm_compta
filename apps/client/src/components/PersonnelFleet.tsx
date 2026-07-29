import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Car, Users, Gauge, IdCard, Stethoscope, FileSignature, AlertTriangle, Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kpi } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getPersonnel, updatePersonnel, addWarning, deleteWarning,
  getVehicles, createVehicle, updateVehicle, deleteVehicle,
  type PersonnelRow, type Vehicle,
} from '@/lib/employees';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';

function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && <button type="button" onClick={onEdit} title="Modifier" className="grid h-8 w-8 place-items-center rounded-md bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"><Pencil className="h-4 w-4" /></button>}
      {onDelete && <button type="button" onClick={onDelete} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}

function StatusChip({ ok, okLabel, koLabel, onToggle }: { ok: boolean; okLabel: string; koLabel: string; onToggle?: () => void }) {
  const cls = ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground';
  const Icon = ok ? Check : Minus;
  return (
    <button type="button" onClick={onToggle} disabled={!onToggle} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls} ${onToggle ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
      <Icon className="h-3.5 w-3.5" /> {ok ? okLabel : koLabel}
    </button>
  );
}

export function PersonnelTab({ companyId, canEdit }: { companyId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['personnel', companyId], queryFn: () => getPersonnel(companyId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['personnel', companyId] });
  const toggle = useMutation({
    mutationFn: (v: { id: number; body: { contractSigned?: boolean; medicalVisit?: boolean } }) => updatePersonnel(companyId, v.id, v.body),
    onSuccess: invalidate, onError: () => toast('Échec.', 'error'),
  });
  const [warnFor, setWarnFor] = useState<PersonnelRow | null>(null);
  const rows = q.data?.rows ?? [];
  const active = rows.filter((r) => r.active);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Employés actifs" value={String(active.length)} />
        <Kpi icon={FileSignature} label="Contrats signés" value={`${active.filter((r) => r.contractSigned).length}/${active.length}`} accent="text-emerald-400" />
        <Kpi icon={Stethoscope} label="Visites médicales" value={`${active.filter((r) => r.medicalVisit).length}/${active.length}`} accent="text-sky-400" />
        <Kpi icon={AlertTriangle} label="Avertissements" value={String(rows.reduce((n, r) => n + r.warnings.length, 0))} accent="text-orange-400" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12 rounded-lg" /><Skeleton className="h-12 rounded-lg" /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyState icon={IdCard} title="Aucun employé" hint="Ajoute des employés dans l’onglet Employés." /></div>
          : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 text-left font-semibold">Employé</th><th className="px-4 py-3 text-left font-semibold">Contrat signé</th><th className="px-4 py-3 text-left font-semibold">Visite médicale</th><th className="px-4 py-3 text-left font-semibold">Véhicule attribué</th><th className="px-4 py-3 text-left font-semibold">Avertissements</th>
            </tr></thead><tbody>
              {rows.map((r) => <tr key={r.id} className={`border-b last:border-b-0 hover:bg-accent/40 ${r.active ? '' : 'opacity-50'}`}>
                <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.roleName ?? (r.active ? 'Employé' : 'Inactif')}</div></td>
                <td className="px-4 py-3"><StatusChip ok={r.contractSigned} okLabel="Signé" koLabel="Non signé" onToggle={canEdit ? () => toggle.mutate({ id: r.id, body: { contractSigned: !r.contractSigned } }) : undefined} /></td>
                <td className="px-4 py-3"><StatusChip ok={r.medicalVisit} okLabel="À jour" koLabel="À faire" onToggle={canEdit ? () => toggle.mutate({ id: r.id, body: { medicalVisit: !r.medicalVisit } }) : undefined} /></td>
                <td className="px-4 py-3">{r.vehicles.length === 0 ? <span className="text-muted-foreground">—</span> : <div className="flex flex-wrap gap-1">{r.vehicles.map((v) => <span key={v.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"><Car className="h-3 w-3" />{v.plate}{v.perf ? ' ⚡' : ''}</span>)}</div>}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setWarnFor(r)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${r.warnings.length ? 'bg-orange-500/15 text-orange-300' : 'bg-muted text-muted-foreground'} hover:opacity-80`}>
                    <AlertTriangle className="h-3.5 w-3.5" /> {r.warnings.length} avert.{canEdit ? ' · gérer' : ''}
                  </button>
                </td>
              </tr>)}
            </tbody></table></div>}
      </div>
      {warnFor && <WarningsModal companyId={companyId} canEdit={canEdit} emp={warnFor} onClose={() => setWarnFor(null)} onChanged={invalidate} />}
    </div>
  );
}

function WarningsModal({ companyId, canEdit, emp, onClose, onChanged }: { companyId: number; canEdit: boolean; emp: PersonnelRow; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [reason, setReason] = useState('');
  const add = useMutation({ mutationFn: () => addWarning(companyId, emp.id, reason.trim()), onSuccess: () => { setReason(''); onChanged(); }, onError: () => toast('Échec.', 'error') });
  const remove = useMutation({ mutationFn: (id: number) => deleteWarning(companyId, emp.id, id), onSuccess: onChanged, onError: () => toast('Échec.', 'error') });
  const warns = emp.warnings;
  return (
    <Modal title={`Avertissements — ${emp.name}`} onClose={onClose}>
      <div className="space-y-3 p-5">
        {warns.length === 0 ? <p className="text-sm text-muted-foreground">Aucun avertissement.</p>
          : <ul className="space-y-2">
              {warns.map((w) => <li key={w.id} className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                <div><p className="text-sm">{w.reason}</p><p className="text-xs text-muted-foreground">{fmtDateTime(w.createdAt)}</p></div>
                {canEdit && <button type="button" onClick={async () => { if (await confirm({ title: 'Supprimer cet avertissement ?', destructive: true })) remove.mutate(w.id); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25"><Trash2 className="h-4 w-4" /></button>}
              </li>)}
            </ul>}
        {canEdit && <form className="space-y-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !add.isPending) add.mutate(); }}>
          <label className="text-sm"><span className={labelCls}>Nouvel avertissement — motif *</span>
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. retard répété, comportement…" autoFocus />
          </label>
          <div className="flex justify-end"><Button type="submit" disabled={!reason.trim() || add.isPending}><Plus className="h-4 w-4" /> Ajouter l’avertissement</Button></div>
        </form>}
      </div>
    </Modal>
  );
}

export function FlotteTab({ companyId, canEdit }: { companyId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['vehicles', companyId], queryFn: () => getVehicles(companyId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehicles', companyId] });
  const [modal, setModal] = useState<{ open: boolean; edit: Vehicle | null }>({ open: false, edit: null });
  const remove = useMutation({ mutationFn: (id: number) => deleteVehicle(companyId, id), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });
  const rows = q.data?.rows ?? []; const s = q.data?.stats; const employees = q.data?.employees ?? [];
  const [sort, setSort] = useState<{ key: 'plate' | 'perf' | 'status' | 'notes'; dir: 1 | -1 }>({ key: 'plate', dir: 1 });
  const toggleSort = (key: 'plate' | 'perf' | 'status' | 'notes') => setSort((s2) => (s2.key === key ? { key, dir: (s2.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sort.key === 'plate') cmp = a.plate.localeCompare(b.plate);
    else if (sort.key === 'perf') cmp = Number(b.perf) - Number(a.perf);
    else if (sort.key === 'status') cmp = (a.assignedName ?? '￿').localeCompare(b.assignedName ?? '￿');
    else cmp = (a.notes ?? '').localeCompare(b.notes ?? '');
    return cmp * sort.dir;
  });
  const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');
  const thBtn = 'flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-foreground';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Car} label="Total véhicules" value={String(s?.total ?? 0)} />
        <Kpi icon={Gauge} label="Perf" value={String(s?.perf ?? 0)} accent="text-orange-400" />
        <Kpi icon={IdCard} label="Attribués" value={String(s?.assigned ?? 0)} accent="text-sky-400" />
        <Kpi icon={Check} label="Disponibles" value={String(s?.available ?? 0)} accent="text-emerald-400" />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Flotte de véhicules</h2>
        {canEdit && <Button onClick={() => setModal({ open: true, edit: null })}><Plus className="h-4 w-4" /> Ajouter un véhicule</Button>}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12 rounded-lg" /><Skeleton className="h-12 rounded-lg" /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyState icon={Car} title="Aucun véhicule" hint="Ajoute un véhicule à la flotte." /></div>
          : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 text-left"><button type="button" className={thBtn} onClick={() => toggleSort('plate')}>Plaque{arrow('plate')}</button></th>
              <th className="px-4 py-3 text-left"><button type="button" className={thBtn} onClick={() => toggleSort('perf')}>Performance{arrow('perf')}</button></th>
              <th className="px-4 py-3 text-left"><button type="button" className={thBtn} onClick={() => toggleSort('status')}>Statut{arrow('status')}</button></th>
              <th className="px-4 py-3 text-left"><button type="button" className={thBtn} onClick={() => toggleSort('notes')}>Notes{arrow('notes')}</button></th>
              <th className="px-4 py-3 text-right font-semibold"></th>
            </tr></thead><tbody>
              {sorted.map((r) => <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/40">
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 font-mono font-semibold"><Car className="h-4 w-4 text-muted-foreground" />{r.plate}</span></td>
                <td className="px-4 py-3">{r.perf ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-300"><Gauge className="h-3.5 w-3.5" /> Perf</span> : <span className="text-muted-foreground">Standard</span>}</td>
                <td className="px-4 py-3">{r.assignedEmployeeId ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300"><IdCard className="h-3.5 w-3.5" /> {r.assignedName ?? 'Attribué'}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300"><Check className="h-3.5 w-3.5" /> Disponible</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.notes || '—'}</td>
                <td className="px-4 py-3"><RowActions onEdit={canEdit ? () => setModal({ open: true, edit: r }) : undefined} onDelete={canEdit ? async () => { if (await confirm({ title: 'Supprimer ce véhicule ?', message: r.plate, destructive: true })) remove.mutate(r.id); } : undefined} /></td>
              </tr>)}
            </tbody></table></div>}
      </div>
      {modal.open && <VehicleModal companyId={companyId} edit={modal.edit} employees={employees} onClose={() => setModal({ open: false, edit: null })} onSaved={invalidate} />}
    </div>
  );
}

function VehicleModal({ companyId, edit, employees, onClose, onSaved }: { companyId: number; edit: Vehicle | null; employees: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [plate, setPlate] = useState(edit?.plate ?? '');
  const [perf, setPerf] = useState(edit?.perf ?? false);
  const [assigned, setAssigned] = useState(edit?.assignedEmployeeId ? String(edit.assignedEmployeeId) : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { plate: plate.trim(), perf, assignedEmployeeId: assigned ? Number(assigned) : null, notes: notes.trim() || null };
      return edit ? updateVehicle(companyId, edit.id, body) : createVehicle(companyId, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => toast('Échec.', 'error'),
  });
  const valid = plate.trim().length > 0;
  return (
    <Modal title={edit ? 'Modifier le véhicule' : 'Nouveau véhicule'} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        <label className="text-sm"><span className={labelCls}>Plaque *</span><input className={inputCls} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ex. 12ABC34" autoFocus /></label>
        <label className="text-sm"><span className={labelCls}>Attribué à</span>
          <select className={inputCls} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">Disponible</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={perf} onChange={(e) => setPerf(e.target.checked)} /> Véhicule performance (perf)</label>
        <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="col-span-2 flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
      </form>
    </Modal>
  );
}
