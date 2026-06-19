import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { memberships, users, companyRoles, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
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
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await gradeInCompany(parsed.data.gradeId, companyId))) {
      return res.status(400).json({ error: 'invalid_grade' });
    }

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.discordId, parsed.data.discordId))
      .limit(1);
    let userId = existingUser[0]?.id;
    if (!userId) {
      const inserted = await db
        .insert(users)
        .values({ discordId: parsed.data.discordId, displayName: parsed.data.displayName });
      userId = inserted[0].insertId;
    }

    const existingMem = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)))
      .limit(1);
    if (existingMem[0]) {
      await db
        .update(memberships)
        .set({ companyRoleId: parsed.data.gradeId, active: true })
        .where(eq(memberships.id, existingMem[0].id));
    } else {
      await db
        .insert(memberships)
        .values({ companyId, userId, companyRoleId: parsed.data.gradeId });
    }

    emitInvalidate(['irs', `company:${companyId}`], [['members', companyId]]);
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
    emitInvalidate(['irs', `company:${companyId}`], [['members', companyId]]);
    res.json({ ok: true });
  }),
);

membersRouter.delete(
  '/:mid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const mid = parseId(req.params.mid);
    if (!companyId || !mid) return res.status(400).json({ error: 'bad_request' });
    await db
      .delete(memberships)
      .where(and(eq(memberships.id, mid), eq(memberships.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['members', companyId]]);
    res.json({ ok: true });
  }),
);
