import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { hasAppAccess } from '@rp-compta/shared';
import { db } from '../db';
import { announcements, announcementReads, userAppRoles } from '../db/schema';
import { requireAuth, requireAppRole, isDevUser } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { notify, allCompanyManagerUserIds } from '../services/notifications';
import { recordAudit } from '../services/audit';
import { emitInvalidateAll } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function isIrs(userId: number): Promise<boolean> {
  const roles = await db.select({ role: userAppRoles.role }).from(userAppRoles).where(eq(userAppRoles.userId, userId));
  return hasAppAccess(roles.map((r) => r.role), 'irs');
}

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

async function readIds(userId: number, annIds: number[]): Promise<Set<number>> {
  if (!annIds.length) return new Set();
  const rows = await db
    .select({ id: announcementReads.announcementId })
    .from(announcementReads)
    .where(and(eq(announcementReads.userId, userId), inArray(announcementReads.announcementId, annIds)));
  return new Set(rows.map((r) => r.id));
}

announcementsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(100);
    const read = await readIds(req.user!.id, rows.map((r) => r.id));
    res.json({
      canManage: await isIrs(req.user!.id),
      canPostDev: isDevUser(req.user),
      announcements: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        pinned: r.pinned,
        type: r.type,
        important: r.important,
        read: read.has(r.id),
        createdByName: r.createdByName,
        createdAt: r.createdAt,
      })),
    });
  }),
);

announcementsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt))
      .limit(100);
    const read = await readIds(req.user!.id, rows.map((r) => r.id));
    const unread = rows.filter((r) => !read.has(r.id));
    const important = unread.find((r) => r.important) ?? null;
    res.json({
      unreadCount: unread.length,
      important: important
        ? { id: important.id, title: important.title, body: important.body, type: important.type, createdByName: important.createdByName, createdAt: important.createdAt }
        : null,
    });
  }),
);

announcementsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    await db.insert(announcementReads).values({ announcementId: id, userId: req.user!.id }).onDuplicateKeyUpdate({ set: { readAt: sql`CURRENT_TIMESTAMP` } });
    res.json({ ok: true });
  }),
);

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  pinned: z.boolean().optional(),
  type: z.enum(['irs', 'dev']).optional().default('irs'),
  important: z.boolean().optional(),
});

announcementsRouter.post(
  '/',
  requireAppRole('irs'),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.type === 'dev' && !isDevUser(req.user)) {
      return res.status(403).json({ error: 'dev_only' });
    }
    await db.insert(announcements).values({
      title: parsed.data.title,
      body: parsed.data.body,
      pinned: parsed.data.pinned ?? false,
      type: parsed.data.type,
      important: parsed.data.important ?? false,
      createdByUserId: req.user!.id,
      createdByName: req.user!.displayName,
    });
    emitInvalidateAll([['announcements']]);
    const isDev = parsed.data.type === 'dev';
    await notify(await allCompanyManagerUserIds(), {
      type: 'announcement',
      title: isDev ? '🛠️ Annonce dev (HRP)' : 'Communiqué IRS',
      body: parsed.data.title,
      link: '/annonces',
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'announcement_post',
      targetType: 'annonce',
      targetLabel: parsed.data.title,
    });
    res.status(201).json({ ok: true });
  }),
);

announcementsRouter.delete(
  '/:id',
  requireAppRole('irs'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await db.select({ title: announcements.title }).from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(announcements).where(eq(announcements.id, id));
    emitInvalidateAll([['announcements']]);
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'announcement_delete',
      targetType: 'annonce',
      targetLabel: existing[0].title,
    });
    res.json({ ok: true });
  }),
);
