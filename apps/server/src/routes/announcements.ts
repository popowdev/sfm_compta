import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { hasAppAccess } from '@rp-compta/shared';
import { db } from '../db';
import { announcements, userAppRoles } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
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

announcementsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(100);
    res.json({
      canManage: await isIrs(req.user!.id),
      announcements: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        pinned: r.pinned,
        createdByName: r.createdByName,
        createdAt: r.createdAt,
      })),
    });
  }),
);

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  pinned: z.boolean().optional(),
});

announcementsRouter.post(
  '/',
  requireAppRole('irs'),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(announcements).values({
      title: parsed.data.title,
      body: parsed.data.body,
      pinned: parsed.data.pinned ?? false,
      createdByUserId: req.user!.id,
      createdByName: req.user!.displayName,
    });
    emitInvalidateAll([['announcements']]);
    await notify(await allCompanyManagerUserIds(), {
      type: 'announcement',
      title: 'Communiqué IRS',
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
