import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { MODULE_KEYS, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { companyRoles, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getGradesWithPermissions, setRolePermission } from '../services/grades';
import { emitInvalidate } from '../realtime/socket';

export const gradesRouter = Router({ mergeParams: true });

gradesRouter.use(requireAuth, requireAppRole('irs'));

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

async function gradeInCompany(rid: number, companyId: number) {
  const rows = await db
    .select()
    .from(companyRoles)
    .where(and(eq(companyRoles.id, rid), eq(companyRoles.companyId, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

gradesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    res.json(await getGradesWithPermissions(companyId));
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rank: z.number().int().optional(),
});

gradesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(companyRoles).values({
      companyId,
      name: parsed.data.name,
      rank: parsed.data.rank ?? 100,
      isDefault: false,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['grades', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  rank: z.number().int().optional(),
  canManage: z.boolean().optional(),
});

gradesRouter.patch(
  '/:rid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const rid = parseId(req.params.rid);
    if (!companyId || !rid) return res.status(400).json({ error: 'bad_request' });
    if (!(await gradeInCompany(rid, companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (Object.keys(parsed.data).length > 0) {
      await db.update(companyRoles).set(parsed.data).where(eq(companyRoles.id, rid));
    }
    emitInvalidate(['irs', `company:${companyId}`], [['grades', companyId]]);
    res.json({ ok: true });
  }),
);

gradesRouter.delete(
  '/:rid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const rid = parseId(req.params.rid);
    if (!companyId || !rid) return res.status(400).json({ error: 'bad_request' });
    const grade = await gradeInCompany(rid, companyId);
    if (!grade) return res.status(404).json({ error: 'not_found' });
    if (grade.isDefault) return res.status(400).json({ error: 'default_grade' });
    await db.delete(companyRoles).where(eq(companyRoles.id, rid));
    emitInvalidate(['irs', `company:${companyId}`], [['grades', companyId]]);
    res.json({ ok: true });
  }),
);

const permSchema = z.object({ canView: z.boolean(), canWrite: z.boolean() });

gradesRouter.put(
  '/:rid/permissions/:key',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const rid = parseId(req.params.rid);
    const key = req.params.key;
    if (!companyId || !rid || !key || !(MODULE_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    if (!(await gradeInCompany(rid, companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = permSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await setRolePermission(rid, key as ModuleKey, parsed.data.canView, parsed.data.canWrite);
    emitInvalidate(['irs', `company:${companyId}`], [['grades', companyId]]);
    res.json({ ok: true });
  }),
);
