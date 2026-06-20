import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { LOYALTY_TIER_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { companyClients } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(c: typeof companyClients.$inferSelect) {
  return {
    id: c.id,
    companyId: c.companyId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    loyaltyTier: c.loyaltyTier,
    loyaltyPoints: c.loyaltyPoints,
    totalSpent: Number(c.totalSpent),
    accountBalance: Number(c.accountBalance),
    creditLimit: Number(c.creditLimit),
    createdAt: c.createdAt,
  };
}

const posMoney = z.number().nonnegative().finite().max(9_999_999_999.99);
const signedMoney = z.number().finite().min(-9_999_999_999.99).max(9_999_999_999.99);

const bodySchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(50).nullish().or(z.literal('')),
  email: z.string().trim().email().max(150).optional().or(z.literal('')),
  notes: z.string().max(2000).nullish().or(z.literal('')),
  loyaltyTier: z.enum(LOYALTY_TIER_KEYS as [string, ...string[]]).optional(),
  loyaltyPoints: z.number().int().min(0).max(100_000_000).optional(),
  totalSpent: posMoney.optional(),
  accountBalance: signedMoney.optional(),
  creditLimit: posMoney.optional(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const blank = (v: string | null | undefined) => (v ? v : null);

function toRow(d: z.infer<typeof bodySchema>) {
  return {
    name: d.name,
    phone: blank(d.phone),
    email: blank(d.email),
    notes: blank(d.notes),
    loyaltyTier: (d.loyaltyTier ?? 'bronze') as (typeof companyClients.$inferInsert)['loyaltyTier'],
    loyaltyPoints: d.loyaltyPoints ?? 0,
    totalSpent: String(round2(d.totalSpent ?? 0)),
    accountBalance: String(round2(d.accountBalance ?? 0)),
    creditLimit: String(round2(d.creditLimit ?? 0)),
  };
}

export const meClientsRouter = Router({ mergeParams: true });
meClientsRouter.use(requireAuth);

async function gate(userId: number, companyId: number, write: boolean) {
  const acc = await getModuleAccess(userId, companyId, 'clients');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (write && !acc.canWrite) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

meClientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, false);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(companyClients)
      .where(eq(companyClients.companyId, companyId))
      .orderBy(asc(companyClients.name));
    res.json({ canWrite: g.canWrite, clients: rows.map(serialize) });
  }),
);

meClientsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(companyClients).values({ companyId, createdByUserId: req.user!.id, ...toRow(parsed.data) });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meClientsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(companyClients)
      .set(toRow(parsed.data))
      .where(and(eq(companyClients.id, id), eq(companyClients.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.json({ ok: true });
  }),
);

meClientsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(companyClients)
      .where(and(eq(companyClients.id, id), eq(companyClients.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['clients', companyId]]);
    res.json({ ok: true });
  }),
);
