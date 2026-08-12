import type { ModuleKey } from '@rp-compta/shared';

export type PermLevel = 'none' | 'view' | 'use' | 'manage' | 'custom';
export type FixedLevel = Exclude<PermLevel, 'custom'>;

export interface PermBooleans {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const LEVEL_MAP: Record<FixedLevel, PermBooleans> = {
  none: { canView: false, canCreate: false, canEdit: false, canDelete: false },
  view: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  use: { canView: true, canCreate: true, canEdit: true, canDelete: false },
  manage: { canView: true, canCreate: true, canEdit: true, canDelete: true },
};

export function levelToPerm(level: FixedLevel): PermBooleans {
  return { ...LEVEL_MAP[level] };
}

export function permToLevel(perm: PermBooleans, specialAllGranted = true): PermLevel {
  for (const lvl of ['none', 'view', 'use', 'manage'] as const) {
    const m = LEVEL_MAP[lvl];
    if (
      perm.canView === m.canView &&
      perm.canCreate === m.canCreate &&
      perm.canEdit === m.canEdit &&
      perm.canDelete === m.canDelete
    ) {
      if (lvl === 'manage' && !specialAllGranted) return 'custom';
      return lvl;
    }
  }
  return 'custom';
}

export const PERM_LEVELS: { key: FixedLevel; label: string; help: string }[] = [
  { key: 'none', label: 'Rien', help: 'Ne voit pas ce module' },
  { key: 'view', label: 'Voir', help: 'Consultation seule' },
  { key: 'use', label: 'Utiliser', help: 'Peut travailler dessus (créer, modifier)' },
  { key: 'manage', label: 'Gérer', help: 'Contrôle total (supprimer + réglages)' },
];

export const LEVEL_LABEL: Record<PermLevel, string> = {
  none: 'Rien',
  view: 'Voir',
  use: 'Utiliser',
  manage: 'Gérer',
  custom: 'Personnalisé',
};

export const LEVEL_VERB: Record<FixedLevel, string> = {
  none: 'ne voit pas',
  view: 'voit',
  use: 'utilise',
  manage: 'gère',
};

export interface GradePreset {
  key: string;
  label: string;
  help: string;
  canManage: boolean;
  levels: Partial<Record<ModuleKey, FixedLevel>>;
}

export const GRADE_PRESETS: GradePreset[] = [
  {
    key: 'employee',
    label: 'Employé',
    help: 'Utilise les outils du quotidien, ne voit pas la compta ni les réglages.',
    canManage: false,
    levels: {
      caisse: 'use', garage: 'use', badgeuse: 'use', taxi: 'use', runs: 'use',
      pawnshop: 'use', chasse: 'use', concession: 'use', cargaison: 'view', clients: 'use', stocks: 'view',
    },
  },
  {
    key: 'manager',
    label: 'Responsable',
    help: 'Gère le commerce et les employés, voit la compta.',
    canManage: false,
    levels: {
      caisse: 'manage', garage: 'manage', taxi: 'manage', runs: 'manage', pawnshop: 'manage',
      chasse: 'manage', concession: 'manage', cargaison: 'manage', clients: 'manage', stocks: 'manage',
      badgeuse: 'manage', rh: 'use', depenses: 'use', documents: 'use', exercices: 'view',
    },
  },
  {
    key: 'boss',
    label: 'Patron / Co-patron',
    help: 'Accès total : voit et gère tout.',
    canManage: true,
    levels: {},
  },
];
