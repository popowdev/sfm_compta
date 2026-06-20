import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { EMPLOYEE_POSITION_KEYS, CONTRACT_TYPE_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { companyEmployees } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(e: typeof companyEmployees.$inferSelect) {
  return {
    id: e.id,
    companyId: e.companyId,
    name: e.name,
    phone: e.phone,
    dateOfBirth: e.dateOfBirth,
    hireDate: e.hireDate,
    position: e.position,
    contractType: e.contractType,
    contractSigned: e.contractSigned,
    hourlyRate: Number(e.hourlyRate),
    commissionRate: Number(e.commissionRate),
    warnings: e.warnings,
    terminationReason: e.terminationReason,
    active: e.active,
    notes: e.notes,
    createdAt: e.createdAt,
  };
}

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'invalid_date')
  .nullish()
  .or(z.literal(''));

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(50).nullish().or(z.literal('')),
  dateOfBirth: optionalDate,
  hireDate: optionalDate,
  position: z.enum(EMPLOYEE_POSITION_KEYS as [string, ...string[]]),
  contractType: z.enum(CONTRACT_TYPE_KEYS as [string, ...string[]]),
  contractSigned: z.boolean().optional(),
  hourlyRate: z.number().nonnegative().finite().max(99_999_999.99),
  commissionRate: z.number().min(0).max(100),
  warnings: z.number().int().min(0).max(1000),
  terminationReason: z.string().trim().max(255).nullish().or(z.literal('')),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullish().or(z.literal('')),
});

function blank(v: string | null | undefined): string | null {
  return v ? v : null;
}

function toRow(d: z.infer<typeof bodySchema>) {
  return {
    name: d.name,
    phone: blank(d.phone),
    dateOfBirth: blank(d.dateOfBirth),
    hireDate: blank(d.hireDate),
    position: d.position as (typeof companyEmployees.$inferInsert)['position'],
    contractType: d.contractType as (typeof companyEmployees.$inferInsert)['contractType'],
    contractSigned: d.contractSigned ?? false,
    hourlyRate: String(Math.round(d.hourlyRate * 100) / 100),
    commissionRate: String(Math.round(d.commissionRate * 100) / 100),
    warnings: d.warnings,
    terminationReason: blank(d.terminationReason),
    active: d.active ?? true,
    notes: blank(d.notes),
  };
}

export const meEmployeesRouter = Router({ mergeParams: true });
meEmployeesRouter.use(requireAuth);

async function gate(userId: number, companyId: number, write: boolean) {
  const acc = await getModuleAccess(userId, companyId, 'rh');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (write && !acc.canWrite) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

meEmployeesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, false);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(companyEmployees)
      .where(eq(companyEmployees.companyId, companyId))
      .orderBy(asc(companyEmployees.name));
    res.json({ canWrite: g.canWrite, employees: rows.map(serialize) });
  }),
);

meEmployeesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(companyEmployees).values({ companyId, ...toRow(parsed.data) });
    emitInvalidate(['irs', `company:${companyId}`], [['employees', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meEmployeesRouter.put(
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
      .update(companyEmployees)
      .set(toRow(parsed.data))
      .where(and(eq(companyEmployees.id, id), eq(companyEmployees.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['employees', companyId]]);
    res.json({ ok: true });
  }),
);

meEmployeesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(companyEmployees)
      .where(and(eq(companyEmployees.id, id), eq(companyEmployees.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['employees', companyId]]);
    res.json({ ok: true });
  }),
);
