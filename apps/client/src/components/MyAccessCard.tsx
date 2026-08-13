import { Link } from 'react-router-dom';
import { Eye, Wrench, Settings2, Info, type LucideIcon } from 'lucide-react';
import { MODULES } from '@rp-compta/shared';
import type { MyModule } from '@/lib/me';
import { moduleIcon } from '@/lib/moduleIcons';

const COMPANY_PAGE_KEYS = new Set(MODULES.filter((m) => m.companyPage).map((m) => m.key));

type Lvl = 'view' | 'use' | 'manage';
function levelOf(m: MyModule): Lvl | null {
  if (!m.canView) return null;
  if (m.canDelete) return 'manage';
  if (m.canCreate || m.canEdit) return 'use';
  return 'view';
}
const LVL: Record<Lvl, { label: string; verb: string; cls: string; icon: LucideIcon }> = {
  view: { label: 'Voir', verb: 'voir', cls: 'text-sky-500 bg-sky-500/10 ring-sky-500/30', icon: Eye },
  use: { label: 'Utiliser', verb: 'utiliser', cls: 'text-emerald-500 bg-emerald-500/10 ring-emerald-500/30', icon: Wrench },
  manage: { label: 'Gérer', verb: 'gérer', cls: 'text-amber-500 bg-amber-500/10 ring-amber-500/30', icon: Settings2 },
};

export function MyAccessCard({ modules, gradeName, slug }: { modules: MyModule[]; gradeName: string | null; slug: string | undefined }) {
  const scoped = modules.filter((m) => COMPANY_PAGE_KEYS.has(m.key) && m.enabled && !m.blocked);
  const accessible = scoped.filter((m) => m.canView);
  const lockedCount = scoped.length - accessible.length;

  const byVerb: Record<Lvl, string[]> = { manage: [], use: [], view: [] };
  for (const m of accessible) {
    const l = levelOf(m);
    if (l) byVerb[l].push(m.label);
  }
  const parts: string[] = [];
  if (byVerb.manage.length) parts.push(`gérer ${byVerb.manage.join(', ')}`);
  if (byVerb.use.length) parts.push(`utiliser ${byVerb.use.join(', ')}`);
  if (byVerb.view.length) parts.push(`voir ${byVerb.view.join(', ')}`);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Mes accès</h3>
        {gradeName && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Grade : {gradeName}</span>}
      </div>

      {parts.length > 0 ? (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <span className="font-semibold text-emerald-500">En clair,</span> tu peux {parts.join(' · ')}.
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">Ton grade n'a accès à aucun module pour l'instant — demande à ton patron s'il t'en faut un.</p>
      )}

      {accessible.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accessible.map((m) => {
            const l = levelOf(m)!;
            const meta = LVL[l];
            const Icon = moduleIcon(m.key);
            const Badge = meta.icon;
            return (
              <Link
                key={m.key}
                to={`/entreprise/${slug}/m/${m.key}`}
                className="group flex flex-col gap-2 rounded-xl border bg-background p-3.5 transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></div>
                <span className="text-sm font-medium">{m.label}</span>
                <span className={`inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.cls}`}><Badge className="h-3 w-3" /> {meta.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {lockedCount > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" /> {lockedCount} autre{lockedCount > 1 ? 's' : ''} module{lockedCount > 1 ? 's' : ''} exist{lockedCount > 1 ? 'ent' : 'e'} mais ton grade n'y a pas accès — demande à ton patron.
        </p>
      )}
    </div>
  );
}
