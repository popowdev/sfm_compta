import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight } from 'lucide-react';
import type { ModuleKey } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  getCompanies,
  createCompany,
  getCompanyModules,
  toggleModule,
  type Company,
  type ModuleState,
} from '@/lib/companies';

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
    <div className="p-6">
      <div className="mb-1 text-base font-semibold">{company.name}</div>
      <p className="mb-5 text-sm text-muted-foreground">
        Active ou désactive les modules de comptabilité de cette entreprise.
      </p>
      <div className="space-y-5">
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
    </div>
  );
}

export default function Companies() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);

  const companies = useQuery({ queryKey: ['companies'], queryFn: getCompanies });
  const create = useMutation({
    mutationFn: () => createCompany({ name: name.trim() }),
    onSuccess: (c) => {
      setName('');
      setSelected(c);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Entreprises</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Crée les entreprises du serveur et configure leurs modules.
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
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
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
                onClick={() => setSelected(c)}
                className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent ${
                  selected?.id === c.id ? 'bg-accent' : ''
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
                    selected?.id === c.id ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card">
          {selected ? (
            <ModulesPanel company={selected} />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Sélectionne une entreprise pour gérer ses modules.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
