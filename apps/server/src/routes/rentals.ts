import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { companyRentals } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(r: typeof companyRentals.$inferSelect) {
  return {
    id: r.id,
    companyId: r.companyId,
    clientName: r.clientName,
    clientPhone: r.clientPhone,
    label: r.label,
    eventDate: r.eventDate,
    eventTime: r.eventTime,
    durationHours: r.durationHours,
    rentalPrice: Number(r.rentalPrice),
    deposit: Number(r.deposit),
    depositStatus: r.depositStatus,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

const money = z.number().nonnegative().finite().max(9_999_999_999.99);

const bodySchema = z.object({
  clientName: z.string().trim().min(1).max(150),
  clientPhone: z.string().trim().max(50).nullish().or(z.literal('')),
  label: z.string().trim().min(1).max(150),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, 'invalid_date'),
  eventTime: z.string().trim().max(20).nullish().or(z.literal('')),
  durationHours: z.number().int().min(0).max(1000).nullish(),
  rentalPrice: money,
  deposit: money,
  depositStatus: z.enum(['paid', 'returned', 'kept']).optional(),
  status: z.enum(['reserved', 'active', 'completed', 'cancelled']).optional(),
  notes: z.string().max(2000).nullish().or(z.literal('')),
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const blank = (v: string | null | undefined) => (v ? v : null);

function toRow(d: z.infer<typeof bodySchema>) {
  return {
    clientName: d.clientName,
    clientPhone: blank(d.clientPhone),
    label: d.label,
    eventDate: d.eventDate,
    eventTime: blank(d.eventTime),
    durationHours: d.durationHours ?? null,
    rentalPrice: String(round2(d.rentalPrice)),
    deposit: String(round2(d.deposit)),
    depositStatus: (d.depositStatus ?? 'paid') as (typeof companyRentals.$inferInsert)['depositStatus'],
    status: (d.status ?? 'reserved') as (typeof companyRentals.$inferInsert)['status'],
    notes: blank(d.notes),
  };
}

export const meRentalsRouter = Router({ mergeParams: true });
meRentalsRouter.use(requireAuth);

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'locations');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite, canCreate: acc.canCreate, canEdit: acc.canEdit, canDelete: acc.canDelete };
}

meRentalsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(companyRentals)
      .where(eq(companyRentals.companyId, companyId))
      .orderBy(asc(companyRentals.eventDate));
    res.json({ canWrite: g.canWrite, rentals: rows.map(serialize) });
  }),
);

meRentalsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(companyRentals).values({ companyId, createdByUserId: req.user!.id, ...toRow(parsed.data) });
    emitInvalidate(['irs', `company:${companyId}`], [['rentals', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meRentalsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(companyRentals)
      .set(toRow(parsed.data))
      .where(and(eq(companyRentals.id, id), eq(companyRentals.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['rentals', companyId]]);
    res.json({ ok: true });
  }),
);

meRentalsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(companyRentals)
      .where(and(eq(companyRentals.id, id), eq(companyRentals.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['rentals', companyId]]);
    res.json({ ok: true });
  }),
);
