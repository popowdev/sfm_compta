import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Award, Users, LayoutList, HelpCircle, type LucideIcon } from 'lucide-react';
import { MODULES, MODULE_CONFIG, moduleConfigBool, type ModuleKey } from '@rp-compta/shared';
import { toggleMyModule, uploadMyCompanyLogo, type MyModule } from '@/lib/me';
import { useCompany } from '@/lib/useCompany';
import { moduleIcon } from '@/lib/moduleIcons';
import { useAuth } from '@/auth/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ModuleConfigModal } from '@/components/ModuleConfigModal';
import { LoyaltyTiersModal } from '@/components/LoyaltyTiersModal';
import { GradesPanelModal } from '@/components/GradesPanelModal';
import { ModuleHelpModal, moduleHasHelp } from '@/components/ModuleHelpModal';
import { MenuOrganizer } from '@/components/MenuOrganizer';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

const MODULE_DESC: Partial<Record<ModuleKey, string>> = {
  caisse: 'Encaisser des ventes, articles et services.',
  garage: 'Réparations et customs de véhicules, avec commission mécano.',
  clients: 'Fichier clients, fidélité et crédits.',
  stocks: 'Matières premières, articles et inventaire.',
  locations: 'Locations et cautions.',
  declarations: 'Déclarations fiscales hebdomadaires.',
  depenses: 'Dépenses et charges déductibles.',
  subventions: 'Demandes de subventions à l’IRS.',
  dividendes: 'Versements de dividendes aux actionnaires.',
  actionnaires: 'Répartition du capital entre actionnaires.',
  exercices: 'Périodes comptables et compte de résultat.',
  messagerie: 'Échanges avec l’IRS.',
  rh: 'Fiches employés, postes et performances.',
  badgeuse: 'Pointage et heures travaillées.',
  stats: 'Graphiques et statistiques de l’activité.',
  tickets: 'Support et tickets internes.',
  documents: 'Dossiers et documents partagés de l’entreprise.',
  immobilier: 'Gestion des propriétés et loyers.',
  immo_carte: 'Carte interactive des propriétés.',
  taxi: 'Courses citoyens/concitoyens/VIP et flotte.',
  pawnshop: 'Rachat client → stock → revente au grossiste.',
  runs: 'Livraisons à la course, avec part employé.',
  chasse: 'Rachat de gibier au chasseur, revente au grossiste.',
  concession: 'Vente de véhicules neuf/occasion + vitrine publique.',
  cargaison: 'Commandes B2B : part entreprise + part employés à parts égales.',
};

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function AdminRow({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
  border,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
  border: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 p-4 ${border ? 'border-t' : ''}`}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Button variant="outline" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

export default function CompanySettings() {
  const { company: mine, companyId, isLoading } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isStaff = (user?.appRoles ?? []).includes('staff');
  const staffOnlyKeys = new Set(MODULES.filter((m) => m.staffOnly).map((m) => m.key));
  const defaultKeys = new Set(MODULES.filter((m) => m.defaultEnabled).map((m) => m.key));

  const upload = useMutation({
    mutationFn: (file: File) => uploadMyCompanyLogo(companyId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-companies'] }),
    onError: () => toast("Échec de l'envoi du logo.", 'error'),
  });
  const toggle = useMutation({
    mutationFn: (v: { key: MyModule['key']; enabled: boolean }) => toggleMyModule(companyId, v.key, v.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-companies'] }),
    onError: (e: unknown) => toast((e as { info?: { error?: string } })?.info?.error === 'staff_only_module' ? 'Ce module est réservé au staff IRS.' : "Échec de l'activation.", 'error'),
  });
  const [configModule, setConfigModule] = useState<MyModule | null>(null);
  const [helpModule, setHelpModule] = useState<MyModule | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [gradesOpen, setGradesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const clientsMod = mine.modules.find((m) => m.key === 'clients');
  const loyaltyOn =
    !!clientsMod?.enabled && !clientsMod.blocked && moduleConfigBool(clientsMod.config, 'clients', 'loyalty');

  return (
    <div className="max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mine.company.name}</p>
      </div>

      <Section title="Identité">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background text-sm font-semibold text-primary">
            {mine.company.logoUrl ? (
              <img src={mine.company.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(mine.company.name)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{mine.company.name}</div>
            <div className="text-xs text-muted-foreground">Le nom de l’entreprise est géré par l’IRS.</div>
          </div>
          <label className="cursor-pointer">
            <span className={buttonVariants({ variant: 'outline' })}>
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
      </Section>

      <Section title="Modules">
        <p className="mb-3 -mt-1 text-xs text-muted-foreground">
          Active les fonctionnalités visibles dans le menu de l’entreprise. La roue ⚙ règle les options d’un module.
        </p>
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun module disponible pour cette entreprise.
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.group}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {g.group}
                </div>
                <div className="overflow-hidden rounded-xl border bg-card">
                  {g.items.map((m, i) => {
                    const Icon = moduleIcon(m.key);
                    const on = m.enabled && !m.blocked;
                    const staffLocked = staffOnlyKeys.has(m.key) && !isStaff;
                    return (
                      <div key={m.key} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}>
                        <div
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                            on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${m.blocked ? 'text-muted-foreground' : ''}`}>
                              {m.label}
                            </span>
                            {defaultKeys.has(m.key) && !m.blocked && (
                              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400" title="Module de base, activé par défaut">
                                de base
                              </span>
                            )}
                            {m.blocked && (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400" title="Temporairement bloqué par l’IRS (maintenance)">
                                maintenance
                              </span>
                            )}
                            {staffLocked && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary" title="Activable par l’IRS uniquement">
                                réservé staff
                              </span>
                            )}
                          </div>
                          {MODULE_DESC[m.key] && (
                            <div className="truncate text-xs text-muted-foreground">{MODULE_DESC[m.key]}</div>
                          )}
                        </div>
                        {on && moduleHasHelp(m.key) && (
                          <button
                            type="button"
                            onClick={() => setHelpModule(m)}
                            title="Aide du module"
                            aria-label={`Aide de ${m.label}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        )}
                        {on && (MODULE_CONFIG[m.key]?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setConfigModule(m)}
                            title="Options du module"
                            aria-label={`Options de ${m.label}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <Settings2 className="h-4 w-4" />
                          </button>
                        )}
                        <Switch
                          checked={on}
                          disabled={toggle.isPending || m.blocked || staffLocked}
                          ariaLabel={`Activer ${m.label}`}
                          onChange={() => {
                            const enabling = !m.enabled;
                            toggle.mutate({ key: m.key, enabled: enabling });
                            if (enabling && moduleHasHelp(m.key)) {
                              const flag = `rp_compta_modhelp_${companyId}_${m.key}`;
                              if (!localStorage.getItem(flag)) {
                                localStorage.setItem(flag, '1');
                                setHelpModule(m);
                              }
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Gestion avancée">
        <div className="overflow-hidden rounded-xl border bg-card">
          {loyaltyOn && (
            <AdminRow
              icon={Award}
              title="Paliers de fidélité"
              desc="Renommer les paliers et fixer leurs seuils."
              actionLabel="Personnaliser"
              onAction={() => setTiersOpen(true)}
              border={false}
            />
          )}
          <AdminRow
            icon={Users}
            title="Grades & permissions"
            desc="Qui peut voir / créer / modifier / supprimer dans chaque module."
            actionLabel="Gérer"
            onAction={() => setGradesOpen(true)}
            border={loyaltyOn}
          />
          <AdminRow
            icon={LayoutList}
            title="Organiser le menu"
            desc="Réordonne les modules et range-les dans des catégories (glisser-déposer)."
            actionLabel="Organiser"
            onAction={() => setMenuOpen(true)}
            border
          />
        </div>
      </Section>

      <ModuleConfigModal companyId={companyId} module={configModule} onClose={() => setConfigModule(null)} />
      <ModuleHelpModal moduleKey={helpModule?.key ?? null} label={helpModule?.label ?? ''} open={!!helpModule} onClose={() => setHelpModule(null)} />
      <LoyaltyTiersModal companyId={companyId} open={tiersOpen} onClose={() => setTiersOpen(false)} />
      <GradesPanelModal companyId={companyId} open={gradesOpen} onClose={() => setGradesOpen(false)} />
      {menuOpen && (
        <MenuOrganizer
          companyId={companyId}
          modules={mine.modules.filter((m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked).map((m) => ({ key: m.key, label: m.label }))}
          initial={mine.company.menuLayout}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
