import { z } from 'zod';

export const APP_ROLES = ['irs', 'staff', 'gouvernement'] as const;
export type AppRole = (typeof APP_ROLES)[number];

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
