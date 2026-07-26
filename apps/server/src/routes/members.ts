import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { memberships, users, companyRoles, companies, companyEmployees } from '../db/schema';
import { requireAuth, requireAppRole, requireDev } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { canManageCompany } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

export const membersRouter = Router({ mergeParams: true });

membersRouter.use(requireAuth, requireAppRole('irs'));

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function companyExists(id: number): Promise<boolean> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1);
  return !!rows[0];
}

async function gradeInCompany(gid: number, companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(and(eq(companyRoles.id, gid), eq(companyRoles.companyId, companyId)))
    .limit(1);
  return !!rows[0];
}

function isDuplicate(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

async function upsertMember(
  companyId: number,
  data: { discordId: string; displayName: string; gradeId: number },
): Promise<void> {
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.discordId, data.discordId))
    .limit(1);
  let userId = existingUser[0]?.id;
  if (!userId) {
    try {
      const inserted = await db
        .insert(users)
        .values({ discordId: data.discordId, displayName: data.displayName });
      userId = inserted[0].insertId;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      const again = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.discordId, data.discordId))
        .limit(1);
      userId = again[0]?.id;
    }
  }
  if (!userId) throw new Error('user_resolve_failed');

  const existingMem = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)))
    .limit(1);
  if (existingMem[0]) {
    await db
      .update(memberships)
      .set({ companyRoleId: data.gradeId, active: true })
      .where(eq(memberships.id, existingMem[0].id));
    return;
  }
  try {
    await db.insert(memberships).values({ companyId, userId, companyRoleId: data.gradeId });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    await db
      .update(memberships)
      .set({ companyRoleId: data.gradeId, active: true })
      .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)));
  }
}

membersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        discordId: users.discordId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        gradeId: companyRoles.id,
        gradeName: companyRoles.name,
        active: memberships.active,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
      .where(eq(memberships.companyId, companyId));
    res.json(rows);
  }),
);

const createSchema = z.object({
  discordId: z
    .string()
    .min(15)
    .max(32)
    .regex(/^\d+$/),
  displayName: z.string().trim().min(1).max(100),
  gradeId: z.number().int().positive(),
});

membersRouter.post(
  '/',
  requireDev,
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await gradeInCompany(parsed.data.gradeId, companyId))) {
      return res.status(400).json({ error: 'invalid_grade' });
    }
    await upsertMember(companyId, parsed.data);
    emitInvalidate(['irs', `company:${companyId}`], [
      ['members', companyId],
      ['my-members', companyId],
      ['employees', companyId],
      ['my-companies'],
    ]);
    res.status(201).json({ ok: true });
  }),
);

const patchSchema = z.object({ gradeId: z.number().int().positive() });

membersRouter.patch(
  '/:mid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const mid = parseId(req.params.mid);
    if (!companyId || !mid) return res.status(400).json({ error: 'bad_request' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await gradeInCompany(parsed.data.gradeId, companyId))) {
      return res.status(400).json({ error: 'invalid_grade' });
    }
    await db
      .update(memberships)
      .set({ companyRoleId: parsed.data.gradeId })
      .where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [
      ['members', companyId],
      ['my-members', companyId],
    ]);
    res.json({ ok: true });
  }),
);

membersRouter.delete(
  '/:mid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const mid = parseId(req.params.mid);
    if (!companyId || !mid) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)))
      .limit(1);
    await db
      .delete(memberships)
      .where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)));
    if (existing[0]) {
      await db
        .update(companyEmployees)
        .set({ userId: null })
        .where(
          and(
            eq(companyEmployees.companyId, companyId),
            eq(companyEmployees.userId, existing[0].userId),
          ),
        );
    }
    emitInvalidate(['irs', `company:${companyId}`], [
      ['members', companyId],
      ['my-members', companyId],
      ['employees', companyId],
    ]);
    res.json({ ok: true });
  }),
);

// --- Patron-scoped member management (gated by canManageCompany) ---

async function isLastManager(companyId: number, mid: number): Promise<boolean> {
  const rows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(
      and(
        eq(memberships.companyId, companyId),
        eq(memberships.active, true),
        eq(companyRoles.canManage, true),
      ),
    );
  const managerMids = rows.map((r) => r.id);
  return managerMids.length === 1 && managerMids[0] === mid;
}

export const meMembersRouter = Router({ mergeParams: true });
meMembersRouter.use(requireAuth);
meMembersRouter.use(
  asyncHandler(async (req, res, next) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, companyId))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  }),
);

meMembersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId)!;
    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        discordId: users.discordId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        gradeId: companyRoles.id,
        gradeName: companyRoles.name,
        active: memberships.active,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
      .where(eq(memberships.companyId, companyId));
    res.json(rows);
  }),
);

meMembersRouter.post(
  '/',
  requireDev,
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId)!;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await gradeInCompany(parsed.data.gradeId, companyId))) {
      return res.status(400).json({ error: 'invalid_grade' });
    }
    await upsertMember(companyId, parsed.data);
    emitInvalidate(['irs', `company:${companyId}`], [
      ['my-members', companyId],
      ['members', companyId],
      ['employees', companyId],
      ['my-companies'],
    ]);
    res.status(201).json({ ok: true });
  }),
);

meMembersRouter.patch(
  '/:mid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId)!;
    const mid = parseId(req.params.mid);
    if (!mid) return res.status(400).json({ error: 'bad_request' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const target = await db
      .select({ canManage: companyRoles.canManage })
      .from(companyRoles)
      .where(and(eq(companyRoles.id, parsed.data.gradeId), eq(companyRoles.companyId, companyId)))
      .limit(1);
    if (!target[0]) return res.status(400).json({ error: 'invalid_grade' });
    if (!target[0].canManage && (await isLastManager(companyId, mid))) {
      return res.status(400).json({ error: 'last_manager' });
    }
    await db
      .update(memberships)
      .set({ companyRoleId: parsed.data.gradeId })
      .where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [
      ['my-members', companyId],
      ['members', companyId],
      ['my-companies'],
    ]);
    res.json({ ok: true });
  }),
);

meMembersRouter.delete(
  '/:mid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId)!;
    const mid = parseId(req.params.mid);
    if (!mid) return res.status(400).json({ error: 'bad_request' });
    if (await isLastManager(companyId, mid)) {
      return res.status(400).json({ error: 'last_manager' });
    }
    const existing = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)))
      .limit(1);
    await db.delete(memberships).where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)));
    if (existing[0]) {
      await db
        .update(companyEmployees)
        .set({ userId: null })
        .where(
          and(
            eq(companyEmployees.companyId, companyId),
            eq(companyEmployees.userId, existing[0].userId),
          ),
        );
    }
    emitInvalidate(['irs', `company:${companyId}`], [
      ['my-members', companyId],
      ['members', companyId],
      ['employees', companyId],
      ['my-companies'],
    ]);
    res.json({ ok: true });
  }),
);
