import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, like, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  userAppRoles,
  memberships,
  companies,
  companyRoles,
  fivemPlayers,
  fivemCharacters,
} from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { applyWhitelistChange } from '../services/revocation';
import { isStaff } from '../services/access';
import { resyncPlayer, resolveJobGradeLabels } from '../services/fivemSync';
import { recordAudit } from '../services/audit';
import { emitInvalidate, emitInvalidateAll } from '../realtime/socket';

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
adminUsersRouter.use(requireAuth, requireAppRole('staff'));

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
  role: z.string().trim().max(30).optional(),
  whitelisted: z.enum(['actif', 'inactif']).optional(),
});

adminUsersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const { page, limit, role, whitelisted } = parsed.data;
    const q = parsed.data.q?.trim();
    const offset = (page - 1) * limit;

    const conds = [];
    if (q) {
      conds.push(
        or(
          like(users.displayName, `%${q}%`),
          like(users.discordId, `%${q}%`),
          inArray(
            users.discordId,
            db
              .select({ d: fivemCharacters.discordId })
              .from(fivemCharacters)
              .where(like(fivemCharacters.name, `%${q}%`)),
          ),
        ),
      );
    }
    if (whitelisted === 'actif') conds.push(eq(users.whitelisted, true));
    if (whitelisted === 'inactif') conds.push(eq(users.whitelisted, false));
    if (role === '__none__') {
      conds.push(notInArray(users.id, db.select({ id: userAppRoles.userId }).from(userAppRoles)));
    } else if (role) {
      conds.push(
        inArray(
          users.id,
          db
            .select({ id: userAppRoles.userId })
            .from(userAppRoles)
            .where(eq(userAppRoles.role, role as 'irs' | 'staff' | 'gouvernement')),
        ),
      );
    }
    const filter = conds.length ? and(...conds) : undefined;

    const [countRows, usersRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(users).where(filter),
      db.select().from(users).where(filter).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    ]);
    const total = Number(countRows[0]?.n ?? 0);
    const ids = usersRows.map((u) => u.id);
    const discords = usersRows.map((u) => u.discordId);

    const [roleRows, memRows, charRows, rosterRows] = await Promise.all([
      ids.length
        ? db
            .select({ userId: userAppRoles.userId, role: userAppRoles.role })
            .from(userAppRoles)
            .where(inArray(userAppRoles.userId, ids))
        : Promise.resolve([]),
      ids.length
        ? db
            .select({ userId: memberships.userId, companyName: companies.name, grade: companyRoles.name })
            .from(memberships)
            .innerJoin(companies, eq(memberships.companyId, companies.id))
            .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
            .where(and(eq(memberships.active, true), inArray(memberships.userId, ids)))
        : Promise.resolve([]),
      discords.length
        ? db.select().from(fivemCharacters).where(inArray(fivemCharacters.discordId, discords))
        : Promise.resolve([]),
      discords.length
        ? db
            .select({ discordId: fivemPlayers.discordId, selected: fivemPlayers.selectedChar })
            .from(fivemPlayers)
            .where(inArray(fivemPlayers.discordId, discords))
        : Promise.resolve([]),
    ]);
    const rolesByUser = new Map<number, string[]>();
    for (const r of roleRows) {
      const arr = rolesByUser.get(r.userId) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.userId, arr);
    }
    const compsByUser = new Map<number, { name: string; grade: string | null }[]>();
    for (const m of memRows) {
      const arr = compsByUser.get(m.userId) ?? [];
      arr.push({ name: m.companyName, grade: m.grade });
      compsByUser.set(m.userId, arr);
    }
    const selByDiscord = new Map<string, string | null>();
    for (const r of rosterRows) selByDiscord.set(r.discordId, r.selected);
    const charsByDiscord = new Map<
      string,
      { name: string; job: string | null; grade: number; gradeLabel: string | null; unemployed: boolean; selected: boolean }[]
    >();
    const labels = await resolveJobGradeLabels(charRows.map((c) => ({ jobId: c.jobId, grade: c.grade })));
    for (const c of charRows) {
      const arr = charsByDiscord.get(c.discordId) ?? [];
      arr.push({
        name: c.name,
        job: c.unemployed ? null : labels.jobLabel(c.jobId, c.jobLabel),
        grade: c.grade,
        gradeLabel: labels.gradeLabel(c.jobId, c.grade, c.gradeLabel),
        unemployed: c.unemployed,
        selected: selByDiscord.get(c.discordId) === c.name,
      });
      charsByDiscord.set(c.discordId, arr);
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
        characters: charsByDiscord.get(u.discordId) ?? [],
        createdAt: u.createdAt,
      })),
      total,
      page,
      limit,
    });
  }),
);

adminUsersRouter.post(
  '/:id/fivem-resync',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const u = await db.select({ discordId: users.discordId }).from(users).where(eq(users.id, id)).limit(1);
    if (!u[0]) return res.status(404).json({ error: 'not_found' });
    const out = await resyncPlayer(u[0].discordId);
    if (!out.ok) {
      const status = out.reason === 'not_found' ? 404 : out.reason === 'invalid' ? 400 : 502;
      return res.status(status).json({ error: out.reason });
    }
    emitInvalidateAll([['admin-users']]);
    if (out.userId) emitInvalidate(`user:${out.userId}`, [['my-companies']]);
    res.json({ ok: true, count: out.count });
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
