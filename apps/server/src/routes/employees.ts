import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { EMPLOYEE_POSITION_KEYS, CONTRACT_TYPE_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { companyEmployees, memberships, companyRoles, users } from '../db/schema';
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

function serialize(e: typeof companyEmployees.$inferSelect) {
  return {
    id: e.id,
    companyId: e.companyId,
    userId: e.userId,
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
  userId: z.number().int().positive().optional(),
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

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'rh');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite, canCreate: acc.canCreate, canEdit: acc.canEdit, canDelete: acc.canDelete };
}

async function companyMembers(companyId: number) {
  return db
    .select({
      userId: memberships.userId,
      name: users.displayName,
      gradeName: companyRoles.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(and(eq(memberships.companyId, companyId), eq(memberships.active, true)));
}

meEmployeesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });

    const [rows, members] = await Promise.all([
      db
        .select()
        .from(companyEmployees)
        .where(eq(companyEmployees.companyId, companyId))
        .orderBy(asc(companyEmployees.name)),
      companyMembers(companyId),
    ]);

    const memberByUser = new Map(members.map((m) => [m.userId, m]));
    const employees = rows.map((e) => {
      const m = e.userId ? memberByUser.get(e.userId) : undefined;
      return { ...serialize(e), gradeName: m?.gradeName ?? null, linkedName: m?.name ?? null };
    });
    const memberIds = new Set(members.map((m) => m.userId));
    const linked = new Set(
      rows.filter((e) => e.userId !== null && memberIds.has(e.userId)).map((e) => e.userId),
    );
    const unlinked = members.filter((m) => !linked.has(m.userId));

    res.json({ canWrite: g.canWrite, employees, members: unlinked });
  }),
);

meEmployeesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const linkUserId = parsed.data.userId ?? null;
    if (linkUserId !== null) {
      const members = await companyMembers(companyId);
      if (!members.some((m) => m.userId === linkUserId)) {
        return res.status(400).json({ error: 'not_a_member' });
      }
      const existing = await db
        .select({ id: companyEmployees.id })
        .from(companyEmployees)
        .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.userId, linkUserId)))
        .limit(1);
      if (existing[0]) return res.status(409).json({ error: 'already_linked' });
    }
    try {
      await db.insert(companyEmployees).values({ companyId, userId: linkUserId, ...toRow(parsed.data) });
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'already_linked' });
      }
      throw err;
    }
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
    const g = await gate(req, companyId);
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
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(companyEmployees)
      .where(and(eq(companyEmployees.id, id), eq(companyEmployees.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['employees', companyId]]);
    res.json({ ok: true });
  }),
);
