import { z } from 'zod';

export const APP_ROLES = ['irs', 'staff', 'gouvernement'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function hasAppAccess(roles: AppRole[], required: AppRole): boolean {
  if (roles.includes('staff')) return true;
  return roles.includes(required);
}

export const COMPANY_ROLES = ['pdg', 'patron', 'co_patron', 'gerant', 'employe'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const MODULE_KEYS = [
  'declarations',
  'bareme',
  'dividendes',
  'actionnaires',
  'subventions',
  'messagerie',
  'caisse',
  'clients',
  'stocks',
  'rh',
  'badgeuse',
  'exercices',
  'depenses',
  'locations',
  'tickets',
  'stats',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  group: string;
  defaultEnabled: boolean;
  companyPage: boolean;
}

export interface EffectiveModule {
  key: ModuleKey;
  label: string;
  group: string;
  blocked: boolean;
  defaultEnabled: boolean;
}

export const MODULES: ModuleDef[] = [
  { key: 'declarations', label: 'Déclarations fiscales', group: 'Fiscalité', defaultEnabled: true, companyPage: true },
  { key: 'subventions', label: 'Subventions', group: 'Fiscalité', defaultEnabled: true, companyPage: true },
  { key: 'exercices', label: 'Exercices comptables', group: 'Comptabilité', defaultEnabled: true, companyPage: true },
  { key: 'depenses', label: 'Dépenses', group: 'Comptabilité', defaultEnabled: true, companyPage: true },
  { key: 'caisse', label: 'Caisse / ventes', group: 'Commerce', defaultEnabled: false, companyPage: true },
  { key: 'clients', label: 'Clients & fidélité', group: 'Commerce', defaultEnabled: false, companyPage: true },
  { key: 'stocks', label: 'Stocks', group: 'Commerce', defaultEnabled: false, companyPage: true },
  { key: 'locations', label: 'Locations / événements', group: 'Commerce', defaultEnabled: false, companyPage: true },
  { key: 'rh', label: 'RH / employés', group: 'Ressources humaines', defaultEnabled: false, companyPage: true },
  { key: 'badgeuse', label: 'Badgeuse', group: 'Ressources humaines', defaultEnabled: false, companyPage: true },
  { key: 'tickets', label: 'Tickets / support', group: 'Communication', defaultEnabled: false, companyPage: true },
  { key: 'messagerie', label: 'Messagerie', group: 'Communication', defaultEnabled: true, companyPage: true },
  { key: 'stats', label: 'Statistiques', group: 'Pilotage', defaultEnabled: true, companyPage: true },
  { key: 'bareme', label: 'Barème fiscal', group: 'Fiscalité', defaultEnabled: true, companyPage: false },
  { key: 'dividendes', label: 'Dividendes', group: 'Fiscalité', defaultEnabled: false, companyPage: false },
  { key: 'actionnaires', label: 'Actionnaires', group: 'Actionnariat', defaultEnabled: false, companyPage: false },
];

export interface ModuleConfigField {
  key: string;
  label: string;
  type: 'boolean';
  default: boolean;
  help?: string;
}

export const MODULE_CONFIG: Partial<Record<ModuleKey, ModuleConfigField[]>> = {
  locations: [
    { key: 'deposit', label: 'Gérer la caution', type: 'boolean', default: true, help: 'Champ caution + son état (payée/rendue/conservée).' },
    { key: 'duration', label: 'Gérer la durée', type: 'boolean', default: true },
    { key: 'time', label: "Gérer l'heure", type: 'boolean', default: true },
  ],
  depenses: [
    { key: 'deductible', label: 'Gérer la déductibilité fiscale', type: 'boolean', default: true },
  ],
  rh: [
    { key: 'commission', label: 'Gérer les commissions', type: 'boolean', default: true },
    { key: 'warnings', label: 'Gérer les avertissements', type: 'boolean', default: true },
  ],
  badgeuse: [
    { key: 'pauses', label: 'Autoriser les pauses', type: 'boolean', default: true },
  ],
  clients: [
    { key: 'loyalty', label: 'Gérer la fidélité (points & paliers)', type: 'boolean', default: true },
    { key: 'credit', label: 'Gérer le compte crédit (solde)', type: 'boolean', default: true },
  ],
};

export interface SpecialAction {
  key: string;
  label: string;
  help?: string;
}

export const MODULE_SPECIAL_ACTIONS: Partial<Record<ModuleKey, SpecialAction[]>> = {
  clients: [
    {
      key: 'adjust_balance',
      label: "Ajuster le solde d'un client",
      help: "Corriger le compte crédit en cas d'erreur. Les gérants l'ont d'office.",
    },
  ],
};

export const LOYALTY_TIERS = [
  { key: 'bronze', label: 'Bronze' },
  { key: 'silver', label: 'Argent' },
  { key: 'gold', label: 'Or' },
  { key: 'platinum', label: 'Platine' },
] as const;
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number]['key'];
export const LOYALTY_TIER_KEYS = LOYALTY_TIERS.map((t) => t.key) as LoyaltyTier[];

export function moduleConfigBool(
  config: Record<string, unknown> | null | undefined,
  moduleKey: ModuleKey,
  fieldKey: string,
): boolean {
  const v = config?.[fieldKey];
  if (typeof v === 'boolean') return v;
  const field = MODULE_CONFIG[moduleKey]?.find((f) => f.key === fieldKey);
  return field ? field.default : true;
}

export const EXPENSE_CATEGORIES = [
  { key: 'salary', label: 'Salaires' },
  { key: 'vehicle', label: 'Véhicules' },
  { key: 'meal', label: 'Repas' },
  { key: 'supply', label: 'Fournitures' },
  { key: 'rent', label: 'Loyer' },
  { key: 'other', label: 'Autre' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['key'];
export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as ExpenseCategory[];

export const EMPLOYEE_POSITIONS = [
  { key: 'pdg', label: 'PDG' },
  { key: 'patron', label: 'Patron' },
  { key: 'co_patron', label: 'Co-patron' },
  { key: 'gerant', label: 'Gérant' },
  { key: 'employe', label: 'Employé' },
  { key: 'apprenti', label: 'Apprenti' },
] as const;
export type EmployeePosition = (typeof EMPLOYEE_POSITIONS)[number]['key'];
export const EMPLOYEE_POSITION_KEYS = EMPLOYEE_POSITIONS.map((p) => p.key) as EmployeePosition[];

export const CONTRACT_TYPES = [
  { key: 'cdi', label: 'CDI' },
  { key: 'cdd', label: 'CDD' },
  { key: 'interim', label: 'Intérim' },
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number]['key'];
export const CONTRACT_TYPE_KEYS = CONTRACT_TYPES.map((c) => c.key) as ContractType[];

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface FiscalConfig {
  dividendTaxRate: number;
  brackets: TaxBracket[];
}

export function computeCorporateTax(benefit: number, brackets: TaxBracket[]): number {
  if (benefit <= 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.min - b.min);
  let tax = 0;
  for (const b of sorted) {
    const upper = b.max ?? Infinity;
    if (benefit <= b.min) break;
    const slice = Math.min(benefit, upper) - b.min;
    if (slice > 0) tax += (slice * b.rate) / 100;
  }
  return Math.round(tax * 100) / 100;
}

export const sessionUserSchema = z.object({
  id: z.string(),
  discordId: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  appRoles: z.array(z.enum(APP_ROLES)),
  whitelisted: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const SOCKET_EVENTS = {
  sessionRevoked: 'session:revoked',
  dataInvalidate: 'data:invalidate',
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
