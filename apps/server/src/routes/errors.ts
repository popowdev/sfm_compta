import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { errorLog } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { genErrorCode, recordError } from '../services/errorLog';

const clientErrSchema = z.object({
  message: z.string().max(500).optional(),
  stack: z.string().max(8000).optional(),
  path: z.string().max(255).optional(),
});

// Public (rate-limité par /api) : un crash côté client remonte ici et reçoit un code.
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

// Staff : coller un code → détails de la panne (message, stack, route, user, heure).
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
