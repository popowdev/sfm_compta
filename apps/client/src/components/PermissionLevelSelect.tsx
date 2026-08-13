import { Ban, Eye, Wrench, Settings2, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { PERM_LEVELS, type PermLevel, type FixedLevel } from '@/lib/permLevels';

const ACTIVE: Record<PermLevel, string> = {
  none: 'bg-muted text-foreground ring-1 ring-inset ring-border',
  view: 'bg-sky-500 text-white shadow-sm',
  use: 'bg-emerald-500 text-white shadow-sm',
  manage: 'bg-amber-500 text-white shadow-sm',
  custom: 'bg-violet-500 text-white shadow-sm',
};

const ICON: Record<PermLevel, LucideIcon> = {
  none: Ban,
  view: Eye,
  use: Wrench,
  manage: Settings2,
  custom: SlidersHorizontal,
};

export function PermissionLevelSelect({
  value,
  onChange,
  disabled = false,
  size = 'md',
}: {
  value: PermLevel;
  onChange: (level: FixedLevel) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <div className={`inline-flex flex-wrap items-center gap-1 rounded-lg border bg-background p-1 ${disabled ? 'opacity-70' : ''}`}>
      {PERM_LEVELS.map((lvl) => {
        const active = value === lvl.key;
        const Icon = ICON[lvl.key];
        return (
          <button
            key={lvl.key}
            type="button"
            disabled={disabled}
            title={lvl.help}
            onClick={() => !disabled && !active && onChange(lvl.key)}
            className={`${pad} inline-flex items-center gap-1.5 rounded-md font-semibold transition-colors ${
              active ? ACTIVE[lvl.key] : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {lvl.label}
          </button>
        );
      })}
      {value === 'custom' && (
        <span className={`${pad} inline-flex items-center gap-1.5 rounded-md font-semibold ${ACTIVE.custom}`} title="Réglage fin : un droit précis diffère des niveaux simples (voir « Réglages fins » du module)">
          <SlidersHorizontal className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          Personnalisé
        </span>
      )}
    </div>
  );
}
