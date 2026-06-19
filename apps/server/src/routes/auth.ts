import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SessionUser } from '@rp-compta/shared';
import { db } from '../db';
import { users, userAppRoles } from '../db/schema';
import { env } from '../env';
import { logger } from '../logger';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchDiscordUser,
  fetchGuildMember,
  discordAvatarUrl,
} from '../config/discord';
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from '../auth/session';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { computeManagedRoles, syncManagedRoles } from '../services/roles';

export const authRouter = Router();

const STATE_COOKIE = 'oauth_state';

authRouter.get('/discord', (req, res) => {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) {
    return res.status(500).json({ error: 'discord_not_configured' });
  }
  const state = randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 600_000,
    path: '/',
  });
  res.redirect(buildAuthorizeUrl(state));
});

authRouter.get('/discord/callback', async (req, res) => {
  const loginError = (reason: string) => res.redirect(`${env.CLIENT_ORIGIN}/login?error=${reason}`);
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expected = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/' });
    if (!code || !state || !expected || state !== expected) return loginError('state');

    const token = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(token.access_token);

    let roles: string[] = [];
    let nick: string | null = null;
    if (env.DISCORD_GUILD_ID) {
      const member = await fetchGuildMember(token.access_token, env.DISCORD_GUILD_ID);
      roles = member.roles;
      nick = member.nick;
    }
    const whitelistConfigured = Boolean(env.DISCORD_GUILD_ID && env.DISCORD_WHITELIST_ROLE_ID);
    const whitelisted = whitelistConfigured && roles.includes(env.DISCORD_WHITELIST_ROLE_ID!);

    const displayName = nick ?? discordUser.global_name ?? discordUser.username;
    const avatarUrl = discordAvatarUrl(discordUser.id, discordUser.avatar);
    const now = new Date();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.discordId, discordUser.id))
      .limit(1);

    let userId: number;
    if (existing[0]) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({ displayName, avatarUrl, whitelisted, lastWhitelistCheck: now })
        .where(eq(users.id, userId));
    } else {
      const inserted = await db
        .insert(users)
        .values({ discordId: discordUser.id, displayName, avatarUrl, whitelisted, lastWhitelistCheck: now });
      userId = inserted[0].insertId;
    }

    await syncManagedRoles(userId, computeManagedRoles(discordUser.id, roles));

    if (whitelistConfigured && !whitelisted) return loginError('not_whitelisted');

    const sid = await createSession(userId);
    setSessionCookie(res, sid);
    res.redirect(env.CLIENT_ORIGIN);
  } catch (err) {
    logger.error({ err }, 'discord callback failed');
    loginError('oauth');
  }
});

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) await destroySession(sid);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const roleRows = await db
      .select({ role: userAppRoles.role })
      .from(userAppRoles)
      .where(eq(userAppRoles.userId, user.id));

    const body: SessionUser = {
      id: String(user.id),
      discordId: user.discordId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      appRoles: roleRows.map((r) => r.role),
      whitelisted: user.whitelisted,
    };
    res.json(body);
  }),
);
