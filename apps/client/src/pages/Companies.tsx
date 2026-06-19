import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, Trash2 } from 'lucide-react';
import type { ModuleKey } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  getCompanies,
  createCompany,
  getCompanyModules,
  toggleModule,
  getShareholders,
  addShareholder,
  deleteShareholder,
  updateCompany,
  uploadCompanyLogo,
  type Company,
  type ModuleState,
} from '@/lib/companies';
import { getGrades, createGrade, deleteGrade, setGradePermission } from '@/lib/grades';

const inputCls =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function ModulesPanel({ company }: { company: Company }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['company-modules', company.id],
    queryFn: () => getCompanyModules(company.id),
  });
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: ModuleKey; enabled: boolean }) =>
      toggleModule(company.id, key, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-modules', company.id] }),
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Chargement des modules…</div>;
  }

  const groups: { group: string; items: ModuleState[] }[] = [];
  for (const m of data) {
    let g = groups.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <div className="space-y-5 p-6">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.group}
          </div>
          <div className="overflow-hidden rounded-lg border">
            {g.items.map((m, i) => (
              <div
                key={m.key}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t' : ''}`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className={m.blocked ? 'text-muted-foreground' : ''}>{m.label}</span>
                  {m.blocked && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
                      maintenance
                    </span>
                  )}
                </span>
                <Switch
                  checked={m.enabled && !m.blocked}
                  disabled={toggle.isPending || m.blocked}
                  onChange={() => toggle.mutate({ key: m.key, enabled: !m.enabled })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShareholdersPanel({ company }: { company: Company }) {
  const queryClient = useQueryClient();
  const valuation = Number(company.valuation) || 0;
  const [valDraft, setValDraft] = useState(String(valuation));
  useEffect(() => setValDraft(String(Number(company.valuation) || 0)), [company.valuation, company.id]);

  const { data: list } = useQuery({
    queryKey: ['shareholders', company.id],
    queryFn: () => getShareholders(company.id),
  });

  const saveVal = useMutation({
    mutationFn: () => updateCompany(company.id, { valuation: Number(valDraft) || 0 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteShareholder(company.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shareholders', company.id] }),
  });

  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [anon, setAnon] = useState(false);
  const [pub, setPub] = useState('');
  const add = useMutation({
    mutationFn: () =>
      addShareholder(company.id, {
        name: name.trim(),
        percentage: Number(pct) || 0,
        anonymous: anon,
        publicName: anon ? pub.trim() || null : null,
      }),
    onSuccess: () => {
      setName('');
      setPct('');
      setAnon(false);
      setPub('');
      queryClient.invalidateQueries({ queryKey: ['shareholders', company.id] });
    },
  });

  const total = (list ?? []).reduce((s, x) => s + x.percentage, 0);
  const perPart = valuation / 100;

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-lg border p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Valorisation
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            type="number"
            value={valDraft}
            onChange={(e) => setValDraft(e.target.value)}
            className={`${inputCls} w-44`}
          />
          <span className="text-sm text-muted-foreground">$ total</span>
          <Button
            size="sm"
            variant="outline"
            disabled={saveVal.isPending || Number(valDraft) === valuation}
            onClick={() => saveVal.mutate()}
          >
            Enregistrer
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            Valeur d'une part (1%) : <span className="font-medium text-foreground">{fmt(perPart)} $</span>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-3 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex-1">Actionnaire</span>
          <span className="w-16 text-right">Parts</span>
          <span className="w-28 text-right">Valeur</span>
          <span className="w-9" />
        </div>
        {(list ?? []).map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.shareType}
                {s.anonymous && (
                  <span className="ml-2 text-amber-400">anonyme · {s.publicName || 'Investisseur privé'}</span>
                )}
              </div>
            </div>
            <span className="w-16 text-right text-sm">{s.percentage}%</span>
            <span className="w-28 text-right text-sm">{fmt((valuation * s.percentage) / 100)} $</span>
            <button
              type="button"
              onClick={() => remove.mutate(s.id)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(list ?? []).length === 0 && (
          <div className="px-4 py-4 text-sm text-muted-foreground">Aucun actionnaire.</div>
        )}
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
          <span className="text-muted-foreground">Total des parts attribuées</span>
          <span className={`font-semibold ${total > 100 ? 'text-destructive' : 'text-foreground'}`}>
            {total}%
          </span>
        </div>
      </div>

      <form
        className="rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && pct) add.mutate();
        }}
      >
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ajouter un actionnaire
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <input
            placeholder="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} flex-1`}
          />
          <input
            type="number"
            placeholder="%"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className={`${inputCls} w-20`}
          />
          <Button type="submit" disabled={!name.trim() || !pct || add.isPending}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          Rendre anonyme côté public
        </label>
        {anon && (
          <input
            placeholder="Nom public (ex. Investisseur privé)"
            value={pub}
            onChange={(e) => setPub(e.target.value)}
            className={`${inputCls} mt-2 w-full`}
          />
        )}
      </form>
    </div>
  );
}

function CompanyInfoPanel({ company }: { company: Company }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(company.name);
  useEffect(() => setName(company.name), [company.name, company.id]);

  const saveName = useMutation({
    mutationFn: () => updateCompany(company.id, { name: name.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });
  const setActive = useMutation({
    mutationFn: (active: boolean) => updateCompany(company.id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadCompanyLogo(company.id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  return (
    <div className="space-y-5 p-6">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Logo
        </div>
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background text-sm font-semibold text-primary">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(company.name)
            )}
          </div>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent">
              {upload.isPending ? 'Envoi…' : 'Changer le logo'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
          </label>
          {upload.isError && (
            <span className="text-sm text-destructive">Échec (image &lt; 2 Mo).</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nom
        </div>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} flex-1`} />
          <Button
            variant="outline"
            disabled={!name.trim() || name.trim() === company.name || saveName.isPending}
            onClick={() => saveName.mutate()}
          >
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <div className="text-sm font-medium">Entreprise active</div>
          <div className="text-xs text-muted-foreground">Désactivée = suspendue / masquée.</div>
        </div>
        <Switch
          checked={company.active}
          disabled={setActive.isPending}
          onChange={() => setActive.mutate(!company.active)}
        />
      </div>
    </div>
  );
}

function GradesPanel({ company }: { company: Company }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['grades', company.id], queryFn: () => getGrades(company.id) });
  const [selId, setSelId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (data && (selId === null || !data.grades.some((g) => g.id === selId))) {
      setSelId(data.grades[0]?.id ?? null);
    }
  }, [data, selId]);

  const create = useMutation({
    mutationFn: () => createGrade(company.id, newName.trim()),
    onSuccess: () => {
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['grades', company.id] });
    },
  });
  const del = useMutation({
    mutationFn: (rid: number) => deleteGrade(company.id, rid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grades', company.id] }),
  });
  const setPerm = useMutation({
    mutationFn: (v: { rid: number; key: ModuleKey; canView: boolean; canWrite: boolean }) =>
      setGradePermission(company.id, v.rid, v.key, v.canView, v.canWrite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grades', company.id] }),
  });

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  const selected = data.grades.find((g) => g.id === selId) ?? null;

  const groups: { group: string; items: typeof data.modules }[] = [];
  for (const m of data.modules) {
    let g = groups.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {data.grades.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setSelId(g.id)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              selId === g.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:text-foreground'
            }`}
          >
            {g.name}
          </button>
        ))}
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouveau grade"
            className={`${inputCls} h-8 w-36`}
          />
          <Button size="sm" variant="outline" type="submit" disabled={!newName.trim() || create.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {selected && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">{selected.name}</div>
            {!selected.isDefault && (
              <button
                type="button"
                onClick={() => del.mutate(selected.id)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer le grade
              </button>
            )}
          </div>
          <div className="space-y-4">
            {groups.map((grp) => (
              <div key={grp.group}>
                <div className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="flex-1">{grp.group}</span>
                  <span className="w-16 text-center">Voir</span>
                  <span className="w-16 text-center">Écrire</span>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  {grp.items.map((m, i) => {
                    const p = selected.permissions[m.key] ?? { canView: false, canWrite: false };
                    return (
                      <div key={m.key} className={`flex items-center px-4 py-2.5 ${i > 0 ? 'border-t' : ''}`}>
                        <span className="flex-1 text-sm">{m.label}</span>
                        <div className="flex w-16 justify-center">
                          <Switch
                            checked={p.canView}
                            disabled={setPerm.isPending}
                            onChange={() =>
                              setPerm.mutate({
                                rid: selected.id,
                                key: m.key,
                                canView: !p.canView,
                                canWrite: !p.canView ? p.canWrite : false,
                              })
                            }
                          />
                        </div>
                        <div className="flex w-16 justify-center">
                          <Switch
                            checked={p.canWrite}
                            disabled={setPerm.isPending}
                            onChange={() =>
                              setPerm.mutate({
                                rid: selected.id,
                                key: m.key,
                                canView: !p.canWrite ? true : p.canView,
                                canWrite: !p.canWrite,
                              })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function CompanyDetail({ company }: { company: Company }) {
  const [tab, setTab] = useState<'modules' | 'grades' | 'shareholders' | 'infos'>('modules');
  return (
    <div>
      <div className="flex items-center gap-1 border-b px-3">
        <TabBtn active={tab === 'modules'} onClick={() => setTab('modules')}>
          Modules
        </TabBtn>
        <TabBtn active={tab === 'grades'} onClick={() => setTab('grades')}>
          Grades
        </TabBtn>
        <TabBtn active={tab === 'shareholders'} onClick={() => setTab('shareholders')}>
          Actionnaires
        </TabBtn>
        <TabBtn active={tab === 'infos'} onClick={() => setTab('infos')}>
          Infos
        </TabBtn>
      </div>
      {tab === 'modules' && <ModulesPanel company={company} />}
      {tab === 'grades' && <GradesPanel company={company} />}
      {tab === 'shareholders' && <ShareholdersPanel company={company} />}
      {tab === 'infos' && <CompanyInfoPanel company={company} />}
    </div>
  );
}

export default function Companies() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const companies = useQuery({ queryKey: ['companies'], queryFn: getCompanies });
  const selected = companies.data?.find((c) => c.id === selectedId) ?? null;

  const create = useMutation({
    mutationFn: () => createCompany({ name: name.trim() }),
    onSuccess: (c) => {
      setName('');
      setSelectedId(c.id);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Entreprises</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Crée les entreprises du serveur, configure leurs modules et leurs actionnaires.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border bg-card">
          <form
            className="flex gap-2 border-b p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de l'entreprise"
              className={`${inputCls} flex-1`}
            />
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              <Plus className="h-4 w-4" />
              Créer
            </Button>
          </form>

          <div>
            {companies.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">Chargement…</div>
            )}
            {companies.data?.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Aucune entreprise pour l'instant.</div>
            )}
            {companies.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent ${
                  selectedId === c.id ? 'bg-accent' : ''
                }`}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background text-xs font-semibold text-primary">
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(c.name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.slug}</div>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    c.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {c.active ? 'active' : 'inactive'}
                </span>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 ${
                    selectedId === c.id ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card">
          {selected ? (
            <CompanyDetail company={selected} />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Sélectionne une entreprise pour gérer ses modules et actionnaires.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
