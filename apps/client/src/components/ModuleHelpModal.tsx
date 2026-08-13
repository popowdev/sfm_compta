import { X, Info, Settings2, PlayCircle, type LucideIcon } from 'lucide-react';
import type { ModuleKey } from '@rp-compta/shared';
import { moduleIcon } from '@/lib/moduleIcons';
import { MODULE_HELP } from '@/lib/moduleHelp';

export function moduleHasHelp(key: ModuleKey): boolean {
  return !!MODULE_HELP[key];
}

function HelpBlock({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-background text-primary"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <p className="mt-0.5 text-sm">{text}</p>
      </div>
    </div>
  );
}

export function ModuleHelpModal({
  moduleKey,
  label,
  open,
  onClose,
}: {
  moduleKey: ModuleKey | null;
  label: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !moduleKey) return null;
  const help = MODULE_HELP[moduleKey];
  if (!help) return null;
  const Icon = moduleIcon(moduleKey);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="text-xs text-muted-foreground">Comment ça marche</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <HelpBlock icon={Info} title="À quoi ça sert" text={help.whatFor} />
          {help.config && <HelpBlock icon={Settings2} title="La config (⚙)" text={help.config} />}
          <HelpBlock icon={PlayCircle} title="Comment l'utiliser" text={help.howTo} />
        </div>
        <div className="flex justify-end border-t p-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            C'est clair, commencer
          </button>
        </div>
      </div>
    </div>
  );
}
