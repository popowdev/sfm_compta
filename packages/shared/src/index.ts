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
}

export interface EffectiveModule {
  key: ModuleKey;
  label: string;
  group: string;
  blocked: boolean;
  defaultEnabled: boolean;
}

export const MODULES: ModuleDef[] = [
  { key: 'declarations', label: 'Déclarations fiscales', group: 'Fiscalité', defaultEnabled: true },
  { key: 'bareme', label: 'Barème fiscal', group: 'Fiscalité', defaultEnabled: true },
  { key: 'dividendes', label: 'Dividendes', group: 'Fiscalité', defaultEnabled: false },
  { key: 'subventions', label: 'Subventions', group: 'Fiscalité', defaultEnabled: true },
  { key: 'actionnaires', label: 'Actionnaires', group: 'Actionnariat', defaultEnabled: false },
  { key: 'exercices', label: 'Exercices comptables', group: 'Comptabilité', defaultEnabled: true },
  { key: 'depenses', label: 'Dépenses', group: 'Comptabilité', defaultEnabled: true },
  { key: 'caisse', label: 'Caisse / ventes', group: 'Commerce', defaultEnabled: false },
  { key: 'clients', label: 'Clients & fidélité', group: 'Commerce', defaultEnabled: false },
  { key: 'stocks', label: 'Stocks', group: 'Commerce', defaultEnabled: false },
  { key: 'locations', label: 'Locations / événements', group: 'Commerce', defaultEnabled: false },
  { key: 'rh', label: 'RH / employés', group: 'Ressources humaines', defaultEnabled: false },
  { key: 'badgeuse', label: 'Badgeuse', group: 'Ressources humaines', defaultEnabled: false },
  { key: 'tickets', label: 'Tickets / support', group: 'Communication', defaultEnabled: false },
  { key: 'messagerie', label: 'Messagerie', group: 'Communication', defaultEnabled: true },
  { key: 'stats', label: 'Statistiques', group: 'Pilotage', defaultEnabled: true },
];

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
