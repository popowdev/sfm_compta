import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db';
import { env } from '../env';
import { companyEvents } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { canManageCompany, isStaff } from '../services/access';
import { eventPosterUpload, eventPosterUrl } from '../services/upload';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(e: typeof companyEvents.$inferSelect) {
  return {
    id: e.id,
    companyId: e.companyId,
    title: e.title,
    posterUrl: e.posterPath,
    eventDate: e.eventDate,
    revenue: Number(e.revenue),
    charges: Number(e.charges),
    profit: Number(e.profit),
    notes: e.notes,
    createdAt: e.createdAt,
  };
}

async function canManage(userId: number, companyId: number): Promise<boolean> {
  return (await isStaff(userId)) || canManageCompany(userId, companyId);
}

export const meCompanyEventsRouter = Router({ mergeParams: true });
meCompanyEventsRouter.use(requireAuth);

meCompanyEventsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManage(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const rows = await db
      .select()
      .from(companyEvents)
      .where(eq(companyEvents.companyId, companyId))
      .orderBy(desc(companyEvents.eventDate), desc(companyEvents.id));
    res.json({ events: rows.map(serialize) });
  }),
);

const money = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? NaN : v),
  z.coerce.number().nonnegative().finite().max(999_999_999.99),
);
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'invalid_date');
const createSchema = z.object({
  title: z.string().trim().min(1).max(150),
  eventDate: dateStr,
  revenue: money,
  charges: money,
  notes: z.string().trim().max(2000).optional(),
});

meCompanyEventsRouter.post(
  '/',
  eventPosterUpload.single('poster'),
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const file = req.file as Express.Multer.File | undefined;
    const cleanup = async () => {
      if (file) await unlink(file.path).catch(() => {});
    };
    if (!companyId) {
      await cleanup();
      return res.status(400).json({ error: 'bad_request' });
    }
    if (!(await canManage(req.user!.id, companyId))) {
      await cleanup();
      return res.status(403).json({ error: 'forbidden' });
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      await cleanup();
      return res.status(400).json({ error: 'bad_request' });
    }
    const d = parsed.data;
    const profit = Math.round((d.revenue - d.charges) * 100) / 100;
    try {
      await db.insert(companyEvents).values({
        companyId,
        title: d.title,
        posterPath: file ? eventPosterUrl(file.filename) : null,
        eventDate: d.eventDate,
        revenue: d.revenue.toFixed(2),
        charges: d.charges.toFixed(2),
        profit: profit.toFixed(2),
        notes: d.notes && d.notes.length ? d.notes : null,
        createdByUserId: req.user!.id,
      });
    } catch (e) {
      await cleanup();
      throw e;
    }
    res.status(201).json({ ok: true });
  }),
);

meCompanyEventsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManage(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const rows = await db
      .select()
      .from(companyEvents)
      .where(and(eq(companyEvents.id, id), eq(companyEvents.companyId, companyId)))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(companyEvents).where(eq(companyEvents.id, id));
    if (rows[0].posterPath) {
      await unlink(path.join(env.UPLOAD_DIR, 'events', path.basename(rows[0].posterPath))).catch(() => {});
    }
    res.json({ ok: true });
  }),
);
