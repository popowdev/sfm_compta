import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { shareholders, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { emitInvalidate } from '../realtime/socket';

export const shareholdersRouter = Router({ mergeParams: true });

shareholdersRouter.use(requireAuth, requireAppRole('irs'));

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

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  percentage: z.number().min(0).max(100),
  shareType: z.string().min(1).max(40).optional(),
  anonymous: z.boolean().optional(),
  publicName: z.string().max(120).nullable().optional(),
});

const patchSchema = createSchema.partial();

shareholdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const rows = await db.select().from(shareholders).where(eq(shareholders.companyId, companyId));
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        percentage: Number(r.percentage),
        shareType: r.shareType,
        anonymous: r.anonymous,
        publicName: r.publicName,
      })),
    );
  }),
);

shareholdersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(shareholders).values({
      companyId,
      name: parsed.data.name,
      percentage: String(parsed.data.percentage),
      shareType: parsed.data.shareType ?? 'ordinaire',
      anonymous: parsed.data.anonymous ?? false,
      publicName: parsed.data.publicName ?? null,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

shareholdersRouter.patch(
  '/:sid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const sid = parseId(req.params.sid);
    if (!companyId || !sid) return res.status(400).json({ error: 'bad_request' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const updates = {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.percentage !== undefined ? { percentage: String(d.percentage) } : {}),
      ...(d.shareType !== undefined ? { shareType: d.shareType } : {}),
      ...(d.anonymous !== undefined ? { anonymous: d.anonymous } : {}),
      ...(d.publicName !== undefined ? { publicName: d.publicName } : {}),
    };
    if (Object.keys(updates).length > 0) {
      await db
        .update(shareholders)
        .set(updates)
        .where(and(eq(shareholders.id, sid), eq(shareholders.companyId, companyId)));
    }
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId]]);
    res.json({ ok: true });
  }),
);

shareholdersRouter.delete(
  '/:sid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const sid = parseId(req.params.sid);
    if (!companyId || !sid) return res.status(400).json({ error: 'bad_request' });
    await db
      .delete(shareholders)
      .where(and(eq(shareholders.id, sid), eq(shareholders.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId]]);
    res.json({ ok: true });
  }),
);
