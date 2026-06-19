import { and, eq } from 'drizzle-orm';
import type { AppRole } from '@rp-compta/shared';
import { db } from '../db';
import { userAppRoles } from '../db/schema';
import { env } from '../env';

function adminIds(): string[] {
  return (env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function computeAppRoles(discordId: string, guildRoles: string[]): AppRole[] {
  const set = new Set<AppRole>();
  if (adminIds().includes(discordId)) set.add('irs');
  if (env.DISCORD_IRS_ROLE_ID && guildRoles.includes(env.DISCORD_IRS_ROLE_ID)) set.add('irs');
  if (env.DISCORD_STAFF_ROLE_ID && guildRoles.includes(env.DISCORD_STAFF_ROLE_ID)) set.add('staff');
  if (env.DISCORD_GOUVERNEMENT_ROLE_ID && guildRoles.includes(env.DISCORD_GOUVERNEMENT_ROLE_ID)) {
    set.add('gouvernement');
  }
  return [...set];
}

export async function syncAppRoles(userId: number, desired: AppRole[]): Promise<void> {
  const current = await db
    .select({ role: userAppRoles.role })
    .from(userAppRoles)
    .where(eq(userAppRoles.userId, userId));
  const currentSet = new Set(current.map((r) => r.role));
  const desiredSet = new Set(desired);

  const toAdd = desired.filter((r) => !currentSet.has(r));
  if (toAdd.length) {
    await db.insert(userAppRoles).values(toAdd.map((role) => ({ userId, role })));
  }
  for (const role of currentSet) {
    if (!desiredSet.has(role)) {
      await db
        .delete(userAppRoles)
        .where(and(eq(userAppRoles.userId, userId), eq(userAppRoles.role, role)));
    }
  }
}
