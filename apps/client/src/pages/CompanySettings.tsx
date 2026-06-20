import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Award } from 'lucide-react';
import { MODULES, MODULE_CONFIG, moduleConfigBool } from '@rp-compta/shared';
import { toggleMyModule, uploadMyCompanyLogo, type MyModule } from '@/lib/me';
import { useCompany } from '@/lib/useCompany';
import { moduleIcon } from '@/lib/moduleIcons';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ModuleConfigModal } from '@/components/ModuleConfigModal';
import { LoyaltyTiersModal } from '@/components/LoyaltyTiersModal';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

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

export default function CompanySettings() {
  const { company: mine, companyId, isLoading } = useCompany();
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: (file: File) => uploadMyCompanyLogo(companyId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-companies'] }),
  });
  const toggle = useMutation({
    mutationFn: (v: { key: MyModule['key']; enabled: boolean }) =>
      toggleMyModule(companyId, v.key, v.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-companies'] }),
  });
  const [configModule, setConfigModule] = useState<MyModule | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (!mine || !mine.canManage) return <Navigate to="/" replace />;

  const groups: { group: string; items: MyModule[] }[] = [];
  for (const m of mine.modules.filter((m) => COMPANY_PAGE_KEYS.has(m.key))) {
    let g = groups.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <div className="max-w-3xl p-8">
      <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
      <p className="mt-1 text-sm text-muted-foreground">{mine.company.name}</p>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <div className="mb-3 text-sm font-semibold">Logo</div>
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background text-sm font-semibold text-primary">
            {mine.company.logoUrl ? (
              <img src={mine.company.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(mine.company.name)
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
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-card">
        <div className="border-b px-5 py-4 text-sm font-semibold">Modules de l'entreprise</div>
        <div className="space-y-5 p-5">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.group}
              </div>
              <div className="overflow-hidden rounded-lg border">
                {g.items.map((m, i) => {
                  const Icon = moduleIcon(m.key);
                  return (
                  <div
                    key={m.key}
                    className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t' : ''}`}
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className={m.blocked ? 'text-muted-foreground' : ''}>{m.label}</span>
                      {m.blocked && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
                          maintenance
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {m.enabled && !m.blocked && (MODULE_CONFIG[m.key]?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setConfigModule(m)}
                          title="Options du module"
                          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Settings2 className="h-4 w-4" />
                        </button>
                      )}
                      <Switch
                        checked={m.enabled && !m.blocked}
                        disabled={toggle.isPending || m.blocked}
                        onChange={() => toggle.mutate({ key: m.key, enabled: !m.enabled })}
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

      {(() => {
        const clientsMod = mine.modules.find((m) => m.key === 'clients');
        const loyaltyOn =
          clientsMod?.enabled &&
          !clientsMod.blocked &&
          moduleConfigBool(clientsMod.config, 'clients', 'loyalty');
        if (!loyaltyOn) return null;
        return (
          <div className="mt-4 flex items-center justify-between rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2.5">
              <Award className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-semibold">Paliers de fidélité</div>
                <div className="text-xs text-muted-foreground">Renommer les paliers et fixer leurs seuils.</div>
              </div>
            </div>
            <Button variant="outline" onClick={() => setTiersOpen(true)}>
              Personnaliser
            </Button>
          </div>
        );
      })()}

      <p className="mt-4 text-xs text-muted-foreground">
        La gestion des grades et des membres arrivera prochainement côté patron.
      </p>

      <ModuleConfigModal
        companyId={companyId}
        module={configModule}
        onClose={() => setConfigModule(null)}
      />
      <LoyaltyTiersModal companyId={companyId} open={tiersOpen} onClose={() => setTiersOpen(false)} />
    </div>
  );
}
