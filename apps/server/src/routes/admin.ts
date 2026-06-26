import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { users, userAppRoles, memberships, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { applyWhitelistChange } from '../services/revocation';
import { isStaff } from '../services/access';
import { recordAudit } from '../services/audit';
import { emitInvalidateAll } from '../realtime/socket';

async function roleHolders(role: 'irs' | 'staff' | 'gouvernement'): Promise<number[]> {
  const rows = await db.select({ userId: userAppRoles.userId }).from(userAppRoles).where(eq(userAppRoles.role, role));
  return rows.map((r) => r.userId);
}
async function rolesOf(userId: number): Promise<string[]> {
  const rows = await db.select({ role: userAppRoles.role }).from(userAppRoles).where(eq(userAppRoles.userId, userId));
  return rows.map((r) => r.role);
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth, requireAppRole('irs'));

adminUsersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [usersRows, roleRows, memRows] = await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select({ userId: userAppRoles.userId, role: userAppRoles.role }).from(userAppRoles),
      db
        .select({ userId: memberships.userId, companyName: companies.name })
        .from(memberships)
        .innerJoin(companies, eq(memberships.companyId, companies.id))
        .where(eq(memberships.active, true)),
    ]);
    const rolesByUser = new Map<number, string[]>();
    for (const r of roleRows) {
      const arr = rolesByUser.get(r.userId) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.userId, arr);
    }
    const compsByUser = new Map<number, string[]>();
    for (const m of memRows) {
      const arr = compsByUser.get(m.userId) ?? [];
      arr.push(m.companyName);
      compsByUser.set(m.userId, arr);
    }
    res.json({
      users: usersRows.map((u) => ({
        id: u.id,
        discordId: u.discordId,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        whitelisted: u.whitelisted,
        roles: rolesByUser.get(u.id) ?? [],
        companies: compsByUser.get(u.id) ?? [],
        createdAt: u.createdAt,
      })),
    });
  }),
);

const irsSchema = z.object({ grant: z.boolean() });

adminUsersRouter.put(
  '/:id/irs',
  requireAppRole('staff'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = irsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const exists = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!exists[0]) return res.status(404).json({ error: 'not_found' });
    if (parsed.data.grant) {
      await db
        .insert(userAppRoles)
        .values({ userId: id, role: 'irs' })
        .onDuplicateKeyUpdate({ set: { role: 'irs' } });
    } else {
      const holders = await roleHolders('irs');
      if (holders.length <= 1 && holders.includes(id)) {
        return res.status(400).json({ error: 'last_irs' });
      }
      await db.delete(userAppRoles).where(and(eq(userAppRoles.userId, id), eq(userAppRoles.role, 'irs')));
    }
    emitInvalidateAll([['admin-users']]);
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: parsed.data.grant ? 'irs_grant' : 'irs_revoke',
      targetType: 'user',
      targetLabel: exists[0].displayName,
    });
    res.json({ ok: true });
  }),
);

const whitelistSchema = z.object({ whitelisted: z.boolean() });

adminUsersRouter.patch(
  '/:id/whitelist',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = whitelistSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (id === req.user!.id && !parsed.data.whitelisted) {
      return res.status(400).json({ error: 'cannot_disable_self' });
    }
    const u = await db
      .select({ discordId: users.discordId, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!u[0]) return res.status(404).json({ error: 'not_found' });
    const targetRoles = await rolesOf(id);
    const targetPrivileged = targetRoles.includes('staff') || targetRoles.includes('gouvernement');
    if (targetPrivileged && !(await isStaff(req.user!.id))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    await applyWhitelistChange(u[0].discordId, parsed.data.whitelisted);
    emitInvalidateAll([['admin-users']]);
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: parsed.data.whitelisted ? 'whitelist_on' : 'whitelist_off',
      targetType: 'user',
      targetLabel: u[0].displayName,
    });
    res.json({ ok: true });
  }),
);

adminUsersRouter.delete(
  '/:id',
  requireAppRole('staff'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    if (id === req.user!.id) return res.status(400).json({ error: 'cannot_delete_self' });
    const targetRoles = await rolesOf(id);
    if (targetRoles.includes('staff')) {
      const holders = await roleHolders('staff');
      if (holders.length <= 1 && holders.includes(id)) return res.status(400).json({ error: 'last_staff' });
    }
    if (targetRoles.includes('irs')) {
      const holders = await roleHolders('irs');
      if (holders.length <= 1 && holders.includes(id)) return res.status(400).json({ error: 'last_irs' });
    }
    const target = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const result = await db.delete(users).where(eq(users.id, id));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidateAll([['admin-users']]);
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'user_delete',
      targetType: 'user',
      targetLabel: target[0]?.displayName ?? `#${id}`,
    });
    res.json({ ok: true });
  }),
);
