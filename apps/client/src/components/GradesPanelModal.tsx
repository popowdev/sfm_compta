import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, ShieldCheck, UserPlus, Sparkles } from 'lucide-react';
import { MODULES, MODULE_SPECIAL_ACTIONS, type ModuleKey } from '@rp-compta/shared';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { PermissionLevelSelect } from '@/components/PermissionLevelSelect';
import {
  levelToPerm, permToLevel, GRADE_PRESETS,
  type FixedLevel, type PermLevel,
} from '@/lib/permLevels';
import {
  getMyGrades, createMyGrade, patchMyGrade, deleteMyGrade,
  setMyGradePermission, setMyGradeSpecialPermission,
  getMyMembers, addMyMember, setMyMemberGrade, removeMyMember,
  type GradeFine,
} from '@/lib/grades';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

function specialsFor(key: string) {
  return MODULE_SPECIAL_ACTIONS[key as ModuleKey] ?? [];
}
function gradeLevel(grade: GradeFine, key: string): PermLevel {
  if (grade.canManage) return 'manage';
  const perm = grade.permissions[key] ?? { canView: false, canCreate: false, canEdit: false, canDelete: false };
  const sp = specialsFor(key);
  const specialAllGranted = sp.length === 0 || sp.every((a) => grade.special?.[key]?.[a.key]);
  return permToLevel(perm, specialAllGranted);
}

export function GradesPanelModal({
  companyId,
  open,
  onClose,
  onlyModule,
}: {
  companyId: number;
  open: boolean;
  onClose: () => void;
  onlyModule?: ModuleKey;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'perms' | 'members'>('perms');
  const q = useQuery({ queryKey: ['my-grades', companyId], queryFn: () => getMyGrades(companyId), enabled: open });
  const [selected, setSelected] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const grades = q.data?.grades ?? [];
  const allModules = (q.data?.modules ?? []).filter((m) => COMPANY_PAGE_KEYS.has(m.key));
  const modules = onlyModule ? allModules.filter((m) => m.key === onlyModule) : allModules;
  const groups = Array.from(new Set(modules.map((m) => m.group)));

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
    onSuccess: () => { setNewName(''); refresh(); toast('Grade créé.', 'success'); },
    onError: () => toast('Échec de la création du grade.', 'error'),
  });
  const patch = useMutation({
    mutationFn: (v: { rid: number; body: { name?: string; canManage?: boolean } }) => patchMyGrade(companyId, v.rid, v.body),
    onSuccess: refresh,
    onError: () => toast('Au moins un grade doit rester « Accès total ».', 'error'),
  });
  const remove = useMutation({
    mutationFn: (rid: number) => deleteMyGrade(companyId, rid),
    onSuccess: () => { setSelected(null); refresh(); },
    onError: () => toast('Impossible : des membres sont encore assignés à ce grade.', 'error'),
  });
  const setPerm = useMutation({
    mutationFn: (v: { rid: number; key: ModuleKey; perm: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean } }) =>
      setMyGradePermission(companyId, v.rid, v.key, v.perm),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ['my-grades', companyId] });
      const prev = queryClient.getQueryData<NonNullable<typeof q.data>>(['my-grades', companyId]);
      queryClient.setQueryData<NonNullable<typeof q.data>>(['my-grades', companyId], (old) =>
        old ? { ...old, grades: old.grades.map((g) => g.id === v.rid ? { ...g, permissions: { ...g.permissions, [v.key]: { ...v.perm, canWrite: v.perm.canCreate || v.perm.canEdit || v.perm.canDelete } } } : g) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['my-grades', companyId], ctx.prev);
      toast('Échec de la modification des accès.', 'error');
    },
    onSettled: refresh,
  });
  const setSpecial = useMutation({
    mutationFn: (v: { rid: number; moduleKey: string; actionKey: string; granted: boolean }) =>
      setMyGradeSpecialPermission(companyId, v.rid, v.moduleKey, v.actionKey, v.granted),
    onSuccess: refresh,
  });

  const applyLevel = (grade: GradeFine, key: ModuleKey, level: FixedLevel) => {
    setPerm.mutate({ rid: grade.id, key, perm: levelToPerm(level) });
    for (const a of specialsFor(key)) {
      setSpecial.mutate({ rid: grade.id, moduleKey: key, actionKey: a.key, granted: level === 'manage' });
    }
  };
  const applyPreset = async (grade: GradeFine, preset: (typeof GRADE_PRESETS)[number]) => {
    await patchMyGrade(companyId, grade.id, { canManage: preset.canManage });
    if (!preset.canManage) {
      for (const m of allModules) {
        const lvl = preset.levels[m.key] ?? 'none';
        await setMyGradePermission(companyId, grade.id, m.key, levelToPerm(lvl));
        for (const a of specialsFor(m.key)) await setMyGradeSpecialPermission(companyId, grade.id, m.key, a.key, lvl === 'manage');
      }
    }
    refresh();
    toast(`Modèle « ${preset.label} » appliqué.`, 'success');
  };

  if (!open) return null;
  const grade = grades.find((g) => g.id === selected) ?? null;

  const recap = grade ? buildRecap(grade, modules) : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">{onlyModule ? 'Qui peut accéder ?' : 'Équipe & accès'}</h2>
            {!onlyModule && (
              <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                <button type="button" onClick={() => setTab('perms')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${tab === 'perms' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>Accès</button>
                <button type="button" onClick={() => setTab('members')} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${tab === 'members' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>Membres</button>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {tab === 'perms' ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
              {grades.map((g) => (
                <button key={g.id} type="button" onClick={() => setSelected(g.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${g.id === selected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  {g.name}{g.canManage && <ShieldCheck className="h-3.5 w-3.5" />}
                </button>
              ))}
              {!onlyModule && (
                <div className="ml-auto flex items-center gap-2">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouveau grade"
                    className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  <Button type="button" onClick={() => newName.trim() && create.mutate()} disabled={!newName.trim() || create.isPending}><Plus className="h-4 w-4" /> Créer</Button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {grade ? (
                <>
                  {!onlyModule && (
                    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${grade.canManage ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input type="checkbox" className="h-4 w-4 rounded border-input accent-amber-500" checked={grade.canManage}
                          onChange={() => patch.mutate({ rid: grade.id, body: { canManage: !grade.canManage } })} />
                        <span><span className="font-semibold">Accès total</span> — patron / co-patron : voit et gère tout automatiquement.</span>
                      </label>
                      {!grade.isDefault && (
                        <Button type="button" variant="outline" size="sm" className="text-destructive hover:bg-destructive/10"
                          onClick={async () => { if (await confirm({ title: 'Supprimer ce grade ?', message: grade.name, destructive: true })) remove.mutate(grade.id); }}>
                          <Trash2 className="h-3.5 w-3.5" /> Supprimer
                        </Button>
                      )}
                    </div>
                  )}

                  {recap && (
                    <div className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">En clair</div>
                      {recap}
                    </div>
                  )}

                  {!grade.canManage && !onlyModule && (
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Modèle de départ :</span>
                      {GRADE_PRESETS.map((p) => (
                        <Button key={p.key} type="button" variant="outline" size="sm" title={p.help} onClick={() => applyPreset(grade, p)}>{p.label}</Button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-5">
                    {groups.map((group) => (
                      <div key={group}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
                        <div className="divide-y rounded-lg border">
                          {modules.filter((m) => m.group === group).map((m) => (
                            <div key={m.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                              <span className="text-sm font-medium">{m.label}</span>
                              <PermissionLevelSelect
                                value={gradeLevel(grade, m.key)}
                                disabled={grade.canManage}
                                onChange={(lvl) => applyLevel(grade, m.key, lvl)}
                                size="sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    <b>Voir</b> = consultation · <b>Utiliser</b> = travailler dessus (créer/modifier) · <b>Gérer</b> = contrôle total (supprimer + réglages). « Accès total » met tout sur Gérer.
                  </p>
                </>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">Aucun grade.</div>
              )}
            </div>
          </>
        ) : (
          <MembersSection companyId={companyId} grades={grades} />
        )}
      </div>
    </div>
  );
}

function buildRecap(grade: GradeFine, modules: { key: ModuleKey; label: string; group: string }[]) {
  if (grade.canManage) return <span>Ce grade a un <b>accès total</b> : il voit et gère tous les modules.</span>;
  const manage: string[] = [];
  const use: string[] = [];
  const view: string[] = [];
  for (const m of modules) {
    const lvl = gradeLevel(grade, m.key);
    if (lvl === 'manage') manage.push(m.label);
    else if (lvl === 'use') use.push(m.label);
    else if (lvl === 'view') view.push(m.label);
    else if (lvl === 'custom') use.push(`${m.label} (perso)`);
  }
  const parts: string[] = [];
  if (manage.length) parts.push(`gère ${manage.join(', ')}`);
  if (use.length) parts.push(`utilise ${use.join(', ')}`);
  if (view.length) parts.push(`voit ${view.join(', ')}`);
  if (!parts.length) return <span className="text-muted-foreground">Ce grade ne voit aucun module pour l'instant.</span>;
  return (
    <span>
      Ce grade {parts.map((p, i) => (<span key={i}>{i > 0 ? ' · ' : ''}<b>{p}</b></span>))}.
    </span>
  );
}

function memberError(e: unknown, fallback: string): string {
  const code = e instanceof ApiError ? e.code : null;
  switch (code) {
    case 'last_manager': return 'Au moins un membre « Accès total » doit rester dans l\'entreprise.';
    case 'invalid_grade': return 'Grade introuvable pour cette entreprise.';
    case 'bad_request': return 'ID Discord invalide (15–32 chiffres) ou champ manquant.';
    case 'forbidden': return 'Vous n\'avez pas les droits de gestion sur cette entreprise.';
    default: return fallback;
  }
}

function MembersSection({ companyId, grades }: { companyId: number; grades: GradeFine[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['my-members', companyId], queryFn: () => getMyMembers(companyId) });
  const [discordId, setDiscordId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gradeId, setGradeId] = useState<number | null>(null);

  useEffect(() => { if (gradeId === null && grades[0]) setGradeId(grades[0].id); }, [grades, gradeId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-members', companyId] });
    queryClient.invalidateQueries({ queryKey: ['my-grades', companyId] });
  };
  const add = useMutation({
    mutationFn: () => addMyMember(companyId, { discordId: discordId.trim(), displayName: displayName.trim(), gradeId: gradeId! }),
    onSuccess: () => { setDiscordId(''); setDisplayName(''); refresh(); },
    onError: (e) => toast(memberError(e, "Échec de l'ajout du membre."), 'error'),
  });
  const setGrade = useMutation({
    mutationFn: (v: { mid: number; gradeId: number }) => setMyMemberGrade(companyId, v.mid, v.gradeId),
    onSuccess: refresh,
    onError: (e) => toast(memberError(e, 'Échec du changement de grade.'), 'error'),
  });
  const remove = useMutation({
    mutationFn: (mid: number) => removeMyMember(companyId, mid),
    onSuccess: refresh,
    onError: (e) => toast(memberError(e, 'Échec du retrait du membre.'), 'error'),
  });

  const members = q.data ?? [];
  const canSubmit = /^\d{15,32}$/.test(discordId.trim()) && displayName.trim().length > 0 && gradeId !== null;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2 border-b px-5 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">ID Discord</label>
          <input value={discordId} onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, ''))} placeholder="123456789012345678"
            className="h-8 w-48 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Nom affiché</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Pseudo RP"
            className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Grade</label>
          <select value={gradeId ?? ''} onChange={(e) => setGradeId(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <Button type="button" onClick={() => add.mutate()} disabled={!canSubmit || add.isPending}><UserPlus className="mr-1.5 h-4 w-4" /> Ajouter</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {members.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Aucun membre assigné.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-semibold">Membre</th>
                  <th className="px-4 py-2 text-left font-semibold">Grade</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.membershipId} className={i > 0 ? 'border-t' : ''}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full" /> : (
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{m.displayName.slice(0, 1).toUpperCase()}</div>
                        )}
                        <div className="leading-tight">
                          <div className="font-medium">{m.displayName}</div>
                          <div className="text-xs text-muted-foreground">{m.discordId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={m.gradeId ?? ''} onChange={(e) => setGrade.mutate({ mid: m.membershipId, gradeId: Number(e.target.value) })} disabled={setGrade.isPending}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
                        {m.gradeId === null && <option value="">— Aucun —</option>}
                        {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={async () => { if (await confirm({ title: 'Retirer ce membre ?', message: m.displayName, destructive: true })) remove.mutate(m.membershipId); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Le membre apparaît dès qu'il s'est connecté au moins une fois via Discord ; sinon il est créé et lié à son ID. Les membres assignés alimentent automatiquement la partie RH.</p>
      </div>
    </>
  );
}
