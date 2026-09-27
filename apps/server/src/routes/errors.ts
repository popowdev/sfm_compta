import { Router } from 'express';
import { z } from 'zod';
import { desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db';
import { errorLog, securityEvents, users } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { genErrorCode, recordError } from '../services/errorLog';

const clientErrSchema = z.object({
  message: z.string().max(500).optional(),
  stack: z.string().max(8000).optional(),
  path: z.string().max(255).optional(),
});

export const errorsRouter = Router();

errorsRouter.post(
  '/client',
  asyncHandler(async (req, res) => {
    const parsed = clientErrSchema.safeParse(req.body ?? {});
    const d = parsed.success ? parsed.data : {};
    const code = genErrorCode();
    await recordError({
      code,
      source: 'client',
      message: d.message ?? 'client error',
      stack: d.stack ?? null,
      method: 'CLIENT',
      path: d.path ?? null,
      userId: req.user?.id ?? null,
      notify: !!req.user?.id,
    });
    res.json({ errorId: code });
  }),
);

export const adminErrorsRouter = Router();
adminErrorsRouter.use(requireAuth, requireAppRole('staff'));

adminErrorsRouter.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const code = (req.params.code ?? '').trim().toUpperCase().slice(0, 16);
    if (!code) return res.status(400).json({ error: 'bad_request' });
    const rows = await db
      .select()
      .from(errorLog)
      .where(eq(errorLog.code, code))
      .orderBy(desc(errorLog.createdAt))
      .limit(5);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ errors: rows });
  }),
);

adminErrorsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(50);
    res.json({ errors: rows });
  }),
);

adminErrorsRouter.get(
  '/security/events',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const rows = await db
      .select({
        id: securityEvents.id,
        ip: securityEvents.ip,
        kind: securityEvents.kind,
        pattern: securityEvents.pattern,
        method: securityEvents.method,
        path: securityEvents.path,
        userAgent: securityEvents.userAgent,
        status: securityEvents.status,
        createdAt: securityEvents.createdAt,
        userName: users.displayName,
        discordId: users.discordId,
      })
      .from(securityEvents)
      .leftJoin(users, eq(users.id, securityEvents.userId))
      .orderBy(desc(securityEvents.createdAt))
      .limit(limit);
    res.json({ events: rows });
  }),
);

adminErrorsRouter.get(
  '/security/summary',
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 24 * 3600_000);
    const byIp = await db
      .select({ ip: securityEvents.ip, n: sql<number>`COUNT(*)`, kinds: sql<string>`GROUP_CONCAT(DISTINCT ${securityEvents.kind})` })
      .from(securityEvents)
      .where(gt(securityEvents.createdAt, since))
      .groupBy(securityEvents.ip)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20);
    res.json({ since, byIp });
  }),
);
