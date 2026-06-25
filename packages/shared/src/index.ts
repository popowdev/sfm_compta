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
  'documents',
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
  { key: 'documents', label: 'Documents', group: 'Communication', defaultEnabled: false, companyPage: true },
  { key: 'bareme', label: 'Barème fiscal', group: 'Fiscalité', defaultEnabled: true, companyPage: false },
  { key: 'dividendes', label: 'Dividendes', group: 'Fiscalité', defaultEnabled: false, companyPage: true },
  { key: 'actionnaires', label: 'Actionnaires', group: 'Actionnariat', defaultEnabled: true, companyPage: true },
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
  exercices: [
    {
      key: 'dividends',
      label: 'Gérer les dividendes',
      type: 'boolean',
      default: true,
      help: 'Distribution de dividendes + impôt sur dividendes dans le résultat.',
    },
  ],
  caisse: [
    {
      key: 'stock',
      label: 'Lier les ventes au stock',
      type: 'boolean',
      default: true,
      help: 'Décrémente les composants des recettes à chaque vente.',
    },
    {
      key: 'clients',
      label: 'Lier les ventes aux comptes clients',
      type: 'boolean',
      default: true,
      help: 'Fidélité + paiement sur compte crédit.',
    },
    {
      key: 'discount',
      label: 'Autoriser les remises',
      type: 'boolean',
      default: true,
    },
  ],
  stocks: [
    {
      key: 'valuation',
      label: 'Gérer la valorisation',
      type: 'boolean',
      default: true,
      help: 'Coût unitaire des articles + valeur totale du stock.',
    },
    {
      key: 'threshold',
      label: "Gérer les seuils d'alerte",
      type: 'boolean',
      default: true,
      help: 'Seuil de stock bas + alertes sur les articles concernés.',
    },
    {
      key: 'supplier',
      label: 'Gérer le fournisseur',
      type: 'boolean',
      default: true,
      help: 'Champ fournisseur sur les entrées de stock.',
    },
  ],
};

export const STOCK_UNITS = [
  { key: 'piece', label: 'pièce', short: 'pc' },
  { key: 'kg', label: 'kilogramme', short: 'kg' },
  { key: 'g', label: 'gramme', short: 'g' },
  { key: 'liter', label: 'litre', short: 'L' },
  { key: 'cl', label: 'centilitre', short: 'cl' },
  { key: 'box', label: 'carton', short: 'carton' },
  { key: 'pack', label: 'pack', short: 'pack' },
  { key: 'other', label: 'unité', short: 'u' },
] as const;
export type StockUnit = (typeof STOCK_UNITS)[number]['key'];
export const STOCK_UNIT_KEYS = STOCK_UNITS.map((u) => u.key) as StockUnit[];

export const STOCK_MOVEMENT_TYPES = [
  { key: 'in', label: 'Entrée' },
  { key: 'out', label: 'Sortie' },
  { key: 'adjust', label: 'Ajustement' },
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]['key'];

export const CATALOG_ITEM_TYPES = [
  { key: 'product', label: 'Produit' },
  { key: 'service', label: 'Service' },
] as const;
export type CatalogItemType = (typeof CATALOG_ITEM_TYPES)[number]['key'];

export const PAYMENT_METHODS = [
  { key: 'cash', label: 'Espèces' },
  { key: 'card', label: 'Carte' },
  { key: 'transfer', label: 'Virement' },
  { key: 'account', label: 'Compte client' },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['key'];
export const PAYMENT_METHOD_KEYS = PAYMENT_METHODS.map((p) => p.key) as PaymentMethod[];

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

export const ASSOCIATION_MEMBER_ROLES = [
  { key: 'president', label: 'Président' },
  { key: 'tresorier', label: 'Trésorier' },
  { key: 'secretaire', label: 'Secrétaire' },
  { key: 'membre', label: 'Membre' },
] as const;
export type AssociationMemberRole = (typeof ASSOCIATION_MEMBER_ROLES)[number]['key'];
export const ASSOCIATION_MEMBER_ROLE_KEYS = ASSOCIATION_MEMBER_ROLES.map((r) => r.key) as AssociationMemberRole[];

export const ASSOCIATION_TX_TYPES = [
  { key: 'cotisation', label: 'Cotisation', dir: 'in' },
  { key: 'don', label: 'Don', dir: 'in' },
  { key: 'subvention', label: 'Subvention', dir: 'in' },
  { key: 'depense', label: 'Dépense', dir: 'out' },
  { key: 'autre', label: 'Autre', dir: 'in' },
] as const;
export type AssociationTxType = (typeof ASSOCIATION_TX_TYPES)[number]['key'];
export const ASSOCIATION_TX_TYPE_KEYS = ASSOCIATION_TX_TYPES.map((t) => t.key) as AssociationTxType[];

export const SUBVENTION_TYPES = [
  { key: 'evenement', label: 'Événement' },
  { key: 'contrat', label: 'Contrat' },
  { key: 'badgeuse', label: 'Badgeuse' },
  { key: 'autre', label: 'Autre' },
] as const;
export type SubventionType = (typeof SUBVENTION_TYPES)[number]['key'];
export const SUBVENTION_TYPE_KEYS = SUBVENTION_TYPES.map((t) => t.key) as SubventionType[];

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
