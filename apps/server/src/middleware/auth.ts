import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import type { AppRole } from '@rp-compta/shared';
import type { User } from '../db/schema';
import { db } from '../db';
import { userAppRoles } from '../db/schema';
import { getSessionUser, SESSION_COOKIE } from '../auth/session';
import { env } from '../env';
import { asyncHandler } from './asyncHandler';

const DEV_DISCORD_IDS = new Set(
  (env.DEV_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

// Le « dev » (toi) : identifié par son Discord ID, indépendant des rôles staff/irs.
export function isDevUser(user: Pick<User, 'discordId'> | null | undefined): boolean {
  return !!user && DEV_DISCORD_IDS.has(user.discordId);
}

export function requireDev(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (!isDevUser(req.user)) return res.status(403).json({ error: 'dev_only' });
  next();
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) return res.status(401).json({ error: 'unauthenticated' });
  const user = await getSessionUser(sid);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  if (!user.whitelisted) return res.status(403).json({ error: 'not_whitelisted' });
  req.user = user;
  next();
});

export function requireWhitelist(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.whitelisted) return res.status(403).json({ error: 'not_whitelisted' });
  next();
}

export function requireAppRole(...roles: AppRole[]) {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    const rows = await db
      .select({ role: userAppRoles.role })
      .from(userAppRoles)
      .where(eq(userAppRoles.userId, req.user.id));
    const userRoles = rows.map((r) => r.role);
    const granted = userRoles.includes('staff') || roles.some((r) => userRoles.includes(r));
    if (!granted) return res.status(403).json({ error: 'forbidden' });
    next();
  });
}
