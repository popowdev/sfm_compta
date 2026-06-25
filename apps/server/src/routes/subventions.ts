import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { subventions, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(s: typeof subventions.$inferSelect) {
  return {
    id: s.id,
    companyId: s.companyId,
    motif: s.motif,
    requesterName: s.requesterName,
    amountRequested: Number(s.amountRequested),
    amountGranted: s.amountGranted === null ? null : Number(s.amountGranted),
    status: s.status,
    notes: s.notes,
    decidedAt: s.decidedAt,
    createdAt: s.createdAt,
  };
}

const amount = z.number().nonnegative().finite().max(999_999_999_999.99);

export const meSubventionsRouter = Router({ mergeParams: true });
meSubventionsRouter.use(requireAuth);

meSubventionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'subventions');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });
    const rows = await db
      .select()
      .from(subventions)
      .where(eq(subventions.companyId, companyId))
      .orderBy(desc(subventions.createdAt));
    res.json({ canWrite: acc.canWrite, subventions: rows.map(serialize) });
  }),
);

const requestSchema = z.object({
  motif: z.string().trim().min(1).max(200),
  requesterName: z.string().trim().min(1).max(120),
  amountRequested: amount,
  notes: z.string().max(2000).optional(),
});

meSubventionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'subventions');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canCreate) return res.status(403).json({ error: 'forbidden' });
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    await db.insert(subventions).values({
      companyId,
      motif: d.motif,
      requesterName: d.requesterName,
      amountRequested: String(d.amountRequested),
      notes: d.notes ?? null,
      requestedByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [
      ['subventions', companyId],
      ['irs-subventions'],
    ]);
    res.status(201).json({ ok: true });
  }),
);

export const irsSubventionsRouter = Router();
irsSubventionsRouter.use(requireAuth, requireAppRole('irs'));

irsSubventionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({ sub: subventions, companyName: companies.name })
      .from(subventions)
      .innerJoin(companies, eq(subventions.companyId, companies.id))
      .orderBy(desc(subventions.createdAt));
    res.json(rows.map((r) => ({ ...serialize(r.sub), companyName: r.companyName })));
  }),
);

const decisionSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'paid']),
  amountGranted: amount.nullable().optional(),
});

irsSubventionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ companyId: subventions.companyId })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    const { status, amountGranted } = parsed.data;
    const decided = status === 'approved' || status === 'paid' || status === 'rejected';
    const updates: Partial<typeof subventions.$inferInsert> = {
      status,
      decidedAt: decided ? new Date() : null,
    };
    if (status === 'approved' || status === 'paid') {
      if (amountGranted == null || amountGranted <= 0) {
        return res.status(400).json({ error: 'amount_required' });
      }
      updates.amountGranted = String(amountGranted);
    } else {
      updates.amountGranted = null;
    }
    await db.update(subventions).set(updates).where(eq(subventions.id, id));
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-subventions'],
      ['subventions', existing[0].companyId],
    ]);
    res.json({ ok: true });
  }),
);

irsSubventionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ companyId: subventions.companyId })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(subventions).where(eq(subventions.id, id));
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-subventions'],
      ['subventions', existing[0].companyId],
    ]);
    res.json({ ok: true });
  }),
);
