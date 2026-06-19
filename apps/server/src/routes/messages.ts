import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { messages, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(m: typeof messages.$inferSelect) {
  return {
    id: m.id,
    companyId: m.companyId,
    body: m.body,
    fromIrs: m.fromIrs,
    senderName: m.senderName,
    createdAt: m.createdAt,
  };
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

async function threadOf(companyId: number) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.companyId, companyId))
    .orderBy(asc(messages.createdAt));
  return rows.map(serialize);
}

export const meMessagesRouter = Router({ mergeParams: true });
meMessagesRouter.use(requireAuth);

meMessagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'messagerie');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });
    res.json({ canWrite: acc.canWrite, messages: await threadOf(companyId) });
  }),
);

meMessagesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'messagerie');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canWrite) return res.status(403).json({ error: 'forbidden' });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(messages).values({
      companyId,
      body: parsed.data.body,
      fromIrs: false,
      senderUserId: req.user!.id,
      senderName: req.user!.displayName,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['messages', companyId], ['irs-messages']]);
    res.status(201).json({ ok: true });
  }),
);

export const irsMessagesRouter = Router();
irsMessagesRouter.use(requireAuth, requireAppRole('irs'));

irsMessagesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({ msg: messages, companyName: companies.name })
      .from(messages)
      .innerJoin(companies, eq(messages.companyId, companies.id))
      .orderBy(asc(messages.createdAt));
    res.json(rows.map((r) => ({ ...serialize(r.msg), companyName: r.companyName })));
  }),
);

irsMessagesRouter.post(
  '/:companyId',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const company = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
      .limit(1);
    if (!company[0]) return res.status(404).json({ error: 'not_found' });
    await db.insert(messages).values({
      companyId,
      body: parsed.data.body,
      fromIrs: true,
      senderUserId: req.user!.id,
      senderName: req.user!.displayName,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['messages', companyId], ['irs-messages']]);
    res.status(201).json({ ok: true });
  }),
);
