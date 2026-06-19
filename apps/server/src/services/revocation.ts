import { eq } from 'drizzle-orm';
import { SOCKET_EVENTS } from '@rp-compta/shared';
import { db } from '../db';
import { users } from '../db/schema';
import { destroyUserSessions } from '../auth/session';
import { getIo } from '../realtime/socket';
import { logger } from '../logger';

export async function applyWhitelistChange(discordId: string, whitelisted: boolean): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);
  const user = rows[0];
  if (!user) return false;

  await db
    .update(users)
    .set({ whitelisted, lastWhitelistCheck: new Date() })
    .where(eq(users.id, user.id));

  if (!whitelisted) {
    await destroyUserSessions(user.id);
    getIo()?.to(`user:${user.id}`).emit(SOCKET_EVENTS.sessionRevoked);
    logger.info({ discordId, userId: user.id }, 'accès révoqué');
  }
  return true;
}
