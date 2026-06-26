import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const meNotificationsRouter = Router();
meNotificationsRouter.use(requireAuth);

meNotificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const unreadRow = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    res.json({
      unread: Number(unreadRow[0]?.n ?? 0),
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        link: r.link,
        read: r.readAt !== null,
        createdAt: r.createdAt,
      })),
    });
  }),
);

meNotificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
    res.json({ ok: true });
  }),
);

meNotificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, req.user!.id)));
    res.json({ ok: true });
  }),
);
