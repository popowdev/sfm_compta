import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { shareholders, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, canManageCompany } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

export const shareholdersRouter = Router({ mergeParams: true });

shareholdersRouter.use(requireAuth, requireAppRole('irs'));

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const meShareholdersRouter = Router({ mergeParams: true });
meShareholdersRouter.use(requireAuth);
meShareholdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'actionnaires');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });
    const comp = await db
      .select({ valuation: companies.valuation })
      .from(companies)
      .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
      .limit(1);
    if (!comp[0]) return res.status(404).json({ error: 'not_found' });
    const canManage = await canManageCompany(req.user!.id, companyId);
    const rows = await db.select().from(shareholders).where(eq(shareholders.companyId, companyId));
    res.json({
      valuation: Number(comp[0].valuation),
      canManage,
      shareholders: rows.map((r) =>
        canManage
          ? {
              id: r.id,
              name: r.name,
              percentage: Number(r.percentage),
              shareType: r.shareType,
              anonymous: r.anonymous,
              publicName: r.publicName,
            }
          : {
              id: r.id,
              name: r.anonymous ? r.publicName || 'Actionnaire anonyme' : r.name,
              percentage: Number(r.percentage),
              shareType: r.shareType,
              anonymous: false,
              publicName: null,
            },
      ),
    });
  }),
);

const meShSchema = z.object({
  name: z.string().trim().min(1).max(120),
  percentage: z.number().min(0).max(100),
  shareType: z.string().trim().min(1).max(40).optional(),
  anonymous: z.boolean().optional(),
  publicName: z.string().trim().max(120).nullish().or(z.literal('')),
});
const meShPatch = meShSchema.partial();

meShareholdersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const parsed = meShSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(shareholders).values({
      companyId,
      name: parsed.data.name,
      percentage: String(parsed.data.percentage),
      shareType: parsed.data.shareType ?? 'ordinaire',
      anonymous: parsed.data.anonymous ?? false,
      publicName: parsed.data.publicName || null,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meShareholdersRouter.patch(
  '/valuation',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const parsed = z.object({ valuation: z.number().min(0).max(999_999_999_999.99) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.update(companies).set({ valuation: String(parsed.data.valuation) }).where(eq(companies.id, companyId));
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId], ['my-companies']]);
    res.json({ ok: true });
  }),
);

meShareholdersRouter.patch(
  '/:sid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const sid = parseId(req.params.sid);
    if (!companyId || !sid) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const parsed = meShPatch.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.name !== undefined) updates.name = d.name;
    if (d.percentage !== undefined) updates.percentage = String(d.percentage);
    if (d.shareType !== undefined) updates.shareType = d.shareType;
    if (d.anonymous !== undefined) updates.anonymous = d.anonymous;
    if (d.publicName !== undefined) updates.publicName = d.publicName || null;
    if (Object.keys(updates).length > 0) {
      await db.update(shareholders).set(updates).where(and(eq(shareholders.id, sid), eq(shareholders.companyId, companyId)));
    }
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId]]);
    res.json({ ok: true });
  }),
);

meShareholdersRouter.delete(
  '/:sid',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const sid = parseId(req.params.sid);
    if (!companyId || !sid) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    await db.delete(shareholders).where(and(eq(shareholders.id, sid), eq(shareholders.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['shareholders', companyId]]);
    res.json({ ok: true });
  }),
);

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
