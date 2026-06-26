import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../db';
import { auditLog } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

export const irsAuditRouter = Router();
irsAuditRouter.use(requireAuth, requireAppRole('irs'));

irsAuditRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(300);
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        actorName: r.actorName,
        action: r.action,
        targetType: r.targetType,
        targetLabel: r.targetLabel,
        detail: r.detail,
        createdAt: r.createdAt,
      })),
    });
  }),
);
