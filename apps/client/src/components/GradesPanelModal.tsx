import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, ShieldCheck, UserPlus } from 'lucide-react';
import { MODULES, MODULE_SPECIAL_ACTIONS, type ModuleKey } from '@rp-compta/shared';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  getMyGrades,
  createMyGrade,
  patchMyGrade,
  deleteMyGrade,
  setMyGradePermission,
  setMyGradeSpecialPermission,
  getMyMembers,
  addMyMember,
  setMyMemberGrade,
  removeMyMember,
  type GradeFine,
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
  const [tab, setTab] = useState<'perms' | 'members'>('perms');
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
  const setSpecial = useMutation({
    mutationFn: (v: { rid: number; moduleKey: string; actionKey: string; granted: boolean }) =>
      setMyGradeSpecialPermission(companyId, v.rid, v.moduleKey, v.actionKey, v.granted),
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
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Grades & membres</h2>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setTab('perms')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === 'perms' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Permissions
              </button>
              <button
                type="button"
                onClick={() => setTab('members')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === 'members' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Membres
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {tab === 'perms' ? (
          <>
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

                  {(() => {
                    const specials = modules
                      .map((m) => ({ m, actions: MODULE_SPECIAL_ACTIONS[m.key as ModuleKey] ?? [] }))
                      .filter((x) => x.actions.length > 0);
                    if (specials.length === 0) return null;
                    return (
                      <div className="mt-5">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions spéciales
                        </h3>
                        <div className="space-y-2.5 rounded-lg border p-3">
                          {specials.flatMap(({ m, actions }) => {
                            const canViewModule =
                              grade.canManage || (grade.permissions[m.key]?.canView ?? false);
                            return actions.map((a) => {
                              const granted = grade.special?.[m.key]?.[a.key] ?? false;
                              return (
                                <label
                                  key={`${m.key}.${a.key}`}
                                  className={`flex items-start gap-2.5 text-sm ${
                                    canViewModule ? '' : 'opacity-50'
                                  }`}
                                  title={canViewModule ? undefined : 'Nécessite l’accès « Voir » sur ce module'}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                                    checked={grade.canManage || granted}
                                    disabled={grade.canManage || setSpecial.isPending || !canViewModule}
                                    onChange={() =>
                                      setSpecial.mutate({
                                        rid: grade.id,
                                        moduleKey: m.key,
                                        actionKey: a.key,
                                        granted: !granted,
                                      })
                                    }
                                  />
                                  <span>
                                    <span className="font-medium">{a.label}</span>
                                    <span className="text-muted-foreground"> · {m.label}</span>
                                    {a.help && (
                                      <span className="block text-xs text-muted-foreground">{a.help}</span>
                                    )}
                                  </span>
                                </label>
                              );
                            });
                          })}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Les grades « gérant » disposent de toutes les actions spéciales d'office.
                        </p>
                      </div>
                    );
                  })()}
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

function memberError(e: unknown, fallback: string): string {
  const code = e instanceof ApiError ? e.code : null;
  switch (code) {
    case 'last_manager':
      return 'Au moins un membre « gérant » doit rester dans l\'entreprise.';
    case 'invalid_grade':
      return 'Grade introuvable pour cette entreprise.';
    case 'bad_request':
      return 'ID Discord invalide (15–32 chiffres) ou champ manquant.';
    case 'forbidden':
      return 'Vous n\'avez pas les droits de gestion sur cette entreprise.';
    default:
      return fallback;
  }
}

function MembersSection({ companyId, grades }: { companyId: number; grades: GradeFine[] }) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['my-members', companyId],
    queryFn: () => getMyMembers(companyId),
  });
  const [discordId, setDiscordId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gradeId, setGradeId] = useState<number | null>(null);

  useEffect(() => {
    if (gradeId === null && grades[0]) setGradeId(grades[0].id);
  }, [grades, gradeId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-members', companyId] });
    queryClient.invalidateQueries({ queryKey: ['my-grades', companyId] });
  };

  const add = useMutation({
    mutationFn: () =>
      addMyMember(companyId, {
        discordId: discordId.trim(),
        displayName: displayName.trim(),
        gradeId: gradeId!,
      }),
    onSuccess: () => {
      setDiscordId('');
      setDisplayName('');
      refresh();
    },
    onError: (e) => alert(memberError(e, "Échec de l'ajout du membre.")),
  });
  const setGrade = useMutation({
    mutationFn: (v: { mid: number; gradeId: number }) => setMyMemberGrade(companyId, v.mid, v.gradeId),
    onSuccess: refresh,
    onError: (e) => alert(memberError(e, 'Échec du changement de grade.')),
  });
  const remove = useMutation({
    mutationFn: (mid: number) => removeMyMember(companyId, mid),
    onSuccess: refresh,
    onError: (e) => alert(memberError(e, 'Échec du retrait du membre.')),
  });

  const members = q.data ?? [];
  const canSubmit = /^\d{15,32}$/.test(discordId.trim()) && displayName.trim().length > 0 && gradeId !== null;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2 border-b px-5 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">ID Discord</label>
          <input
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, ''))}
            placeholder="123456789012345678"
            className="h-8 w-48 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Nom affiché</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Pseudo RP"
            className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Grade</label>
          <select
            value={gradeId ?? ''}
            onChange={(e) => setGradeId(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={() => add.mutate()} disabled={!canSubmit || add.isPending}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Ajouter
        </Button>
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
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                        ) : (
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {m.displayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="leading-tight">
                          <div className="font-medium">{m.displayName}</div>
                          <div className="text-xs text-muted-foreground">{m.discordId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={m.gradeId ?? ''}
                        onChange={(e) => setGrade.mutate({ mid: m.membershipId, gradeId: Number(e.target.value) })}
                        disabled={setGrade.isPending}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      >
                        {m.gradeId === null && <option value="">— Aucun —</option>}
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Retirer ${m.displayName} de l'entreprise ?`)) remove.mutate(m.membershipId);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Le membre apparaît dès qu'il s'est connecté au moins une fois via Discord ; sinon il est
          créé et lié à son ID. Les membres assignés alimentent automatiquement la partie RH.
        </p>
      </div>
    </>
  );
}
