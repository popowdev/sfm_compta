import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { CONTRACT_TYPE_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { companyEmployees, companyVehicles, employeeWarnings, memberships, companyRoles, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';
import { recordAudit } from '../services/audit';

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(e: typeof companyEmployees.$inferSelect, gradeName: string | null = null) {
  return {
    id: e.id,
    companyId: e.companyId,
    userId: e.userId,
    name: e.name,
    phone: e.phone,
    iban: e.iban,
    dateOfBirth: e.dateOfBirth,
    hireDate: e.hireDate,
    companyRoleId: e.companyRoleId,
    gradeName,
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
  iban: z.string().trim().max(40).nullish().or(z.literal('')),
  dateOfBirth: optionalDate,
  hireDate: optionalDate,
  companyRoleId: z.number().int().positive().nullish(),
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
    iban: blank(d.iban),
    dateOfBirth: blank(d.dateOfBirth),
    hireDate: blank(d.hireDate),
    companyRoleId: d.companyRoleId ?? null,
    contractType: d.contractType as (typeof companyEmployees.$inferInsert)['contractType'],
    contractSigned: d.contractSigned ?? false,
    hourlyRate: String(Math.round(d.hourlyRate)),
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

async function roleBelongs(companyId: number, companyRoleId: number | null | undefined): Promise<boolean> {
  if (companyRoleId == null) return true;
  const r = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(and(eq(companyRoles.id, companyRoleId), eq(companyRoles.companyId, companyId)))
    .limit(1);
  return !!r[0];
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
        .select({ e: companyEmployees, gradeName: companyRoles.name })
        .from(companyEmployees)
        .leftJoin(companyRoles, eq(companyEmployees.companyRoleId, companyRoles.id))
        .where(eq(companyEmployees.companyId, companyId))
        .orderBy(asc(companyEmployees.name)),
      companyMembers(companyId),
    ]);

    const memberByUser = new Map(members.map((m) => [m.userId, m]));
    const employees = rows.map((row) => {
      const e = row.e;
      const m = e.userId ? memberByUser.get(e.userId) : undefined;
      return { ...serialize(e, row.gradeName ?? m?.gradeName ?? null), linkedName: m?.name ?? null };
    });
    const memberIds = new Set(members.map((m) => m.userId));
    const linked = new Set(
      rows.filter((row) => row.e.userId !== null && memberIds.has(row.e.userId)).map((row) => row.e.userId),
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
    if (!(await roleBelongs(companyId, parsed.data.companyRoleId))) return res.status(400).json({ error: 'invalid_grade' });
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
    if (!(await roleBelongs(companyId, parsed.data.companyRoleId))) return res.status(400).json({ error: 'invalid_grade' });
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
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'employee_delete',
      targetType: 'employee',
      targetLabel: `#${id}`,
      detail: `entreprise ${companyId}`,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['employees', companyId]]);
    res.json({ ok: true });
  }),
);

async function syncWarningCount(employeeId: number) {
  const [c] = await db.select({ n: sql<number>`COUNT(*)` }).from(employeeWarnings).where(eq(employeeWarnings.employeeId, employeeId));
  await db.update(companyEmployees).set({ warnings: Number(c?.n ?? 0) }).where(eq(companyEmployees.id, employeeId));
}

meEmployeesRouter.get(
  '/personnel',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const emps = await db
      .select({
        id: companyEmployees.id,
        name: companyEmployees.name,
        active: companyEmployees.active,
        contractSigned: companyEmployees.contractSigned,
        medicalVisit: companyEmployees.medicalVisit,
        roleName: companyRoles.name,
      })
      .from(companyEmployees)
      .leftJoin(companyRoles, eq(companyEmployees.companyRoleId, companyRoles.id))
      .where(eq(companyEmployees.companyId, companyId))
      .orderBy(desc(companyEmployees.active), asc(companyEmployees.name));
    const warns = await db
      .select({ id: employeeWarnings.id, employeeId: employeeWarnings.employeeId, reason: employeeWarnings.reason, createdAt: employeeWarnings.createdAt })
      .from(employeeWarnings)
      .where(eq(employeeWarnings.companyId, companyId))
      .orderBy(desc(employeeWarnings.createdAt));
    const vehs = await db
      .select({ id: companyVehicles.id, plate: companyVehicles.plate, perf: companyVehicles.perf, assignedEmployeeId: companyVehicles.assignedEmployeeId })
      .from(companyVehicles)
      .where(eq(companyVehicles.companyId, companyId));
    res.json({
      canWrite: g.canWrite,
      rows: emps.map((e) => ({
        id: e.id,
        name: e.name,
        active: e.active,
        roleName: e.roleName,
        contractSigned: e.contractSigned,
        medicalVisit: e.medicalVisit,
        warnings: warns.filter((w) => w.employeeId === e.id).map((w) => ({ id: w.id, reason: w.reason, createdAt: w.createdAt })),
        vehicles: vehs.filter((v) => v.assignedEmployeeId === e.id).map((v) => ({ id: v.id, plate: v.plate, perf: v.perf })),
      })),
    });
  }),
);

const personnelPatch = z.object({ contractSigned: z.boolean().optional(), medicalVisit: z.boolean().optional() });
meEmployeesRouter.patch(
  '/personnel/:employeeId',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const employeeId = parseId(req.params.employeeId);
    if (!companyId || !employeeId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = personnelPatch.safeParse(req.body);
    if (!p.success || (p.data.contractSigned === undefined && p.data.medicalVisit === undefined)) return res.status(400).json({ error: 'bad_request' });
    const patch: Record<string, unknown> = {};
    if (p.data.contractSigned !== undefined) patch.contractSigned = p.data.contractSigned;
    if (p.data.medicalVisit !== undefined) patch.medicalVisit = p.data.medicalVisit;
    const r = await db.update(companyEmployees).set(patch).where(and(eq(companyEmployees.id, employeeId), eq(companyEmployees.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['personnel', companyId], ['employees', companyId]]);
    res.json({ ok: true });
  }),
);

const warningSchema = z.object({ reason: z.string().trim().min(1).max(500) });
meEmployeesRouter.post(
  '/personnel/:employeeId/warnings',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const employeeId = parseId(req.params.employeeId);
    if (!companyId || !employeeId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = warningSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const [emp] = await db.select({ id: companyEmployees.id }).from(companyEmployees).where(and(eq(companyEmployees.id, employeeId), eq(companyEmployees.companyId, companyId))).limit(1);
    if (!emp) return res.status(404).json({ error: 'not_found' });
    const ins = await db.insert(employeeWarnings).values({ companyId, employeeId, reason: p.data.reason, createdByUserId: req.user!.id });
    await syncWarningCount(employeeId);
    emitInvalidate(['irs', `company:${companyId}`], [['personnel', companyId], ['employees', companyId]]);
    res.status(201).json({ ok: true, id: Number(ins[0].insertId) });
  }),
);
meEmployeesRouter.delete(
  '/personnel/:employeeId/warnings/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const employeeId = parseId(req.params.employeeId);
    const id = parseId(req.params.id);
    if (!companyId || !employeeId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const r = await db.delete(employeeWarnings).where(and(eq(employeeWarnings.id, id), eq(employeeWarnings.employeeId, employeeId), eq(employeeWarnings.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    await syncWarningCount(employeeId);
    emitInvalidate(['irs', `company:${companyId}`], [['personnel', companyId], ['employees', companyId]]);
    res.json({ ok: true });
  }),
);

meEmployeesRouter.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: companyVehicles.id,
        plate: companyVehicles.plate,
        perf: companyVehicles.perf,
        assignedEmployeeId: companyVehicles.assignedEmployeeId,
        assignedName: companyEmployees.name,
        notes: companyVehicles.notes,
        createdAt: companyVehicles.createdAt,
      })
      .from(companyVehicles)
      .leftJoin(companyEmployees, eq(companyVehicles.assignedEmployeeId, companyEmployees.id))
      .where(eq(companyVehicles.companyId, companyId))
      .orderBy(asc(companyVehicles.plate));
    const employees = await db
      .select({ id: companyEmployees.id, name: companyEmployees.name })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)))
      .orderBy(asc(companyEmployees.name));
    res.json({
      canWrite: g.canWrite,
      employees,
      stats: { total: rows.length, perf: rows.filter((r) => r.perf).length, assigned: rows.filter((r) => r.assignedEmployeeId).length, available: rows.filter((r) => !r.assignedEmployeeId).length },
      rows,
    });
  }),
);

const vehicleSchema = z.object({
  plate: z.string().trim().min(1).max(20),
  perf: z.boolean().optional().default(false),
  assignedEmployeeId: z.coerce.number().int().positive().nullish(),
  notes: z.string().max(2000).nullish(),
});
async function employeeInCompany(companyId: number, employeeId: number | null | undefined) {
  if (employeeId == null) return true;
  const [e] = await db.select({ id: companyEmployees.id }).from(companyEmployees).where(and(eq(companyEmployees.id, employeeId), eq(companyEmployees.companyId, companyId))).limit(1);
  return !!e;
}
meEmployeesRouter.post(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = vehicleSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await employeeInCompany(companyId, p.data.assignedEmployeeId))) return res.status(400).json({ error: 'invalid_employee' });
    const ins = await db.insert(companyVehicles).values({ companyId, plate: p.data.plate, perf: p.data.perf, assignedEmployeeId: p.data.assignedEmployeeId ?? null, notes: p.data.notes || null });
    emitInvalidate(['irs', `company:${companyId}`], [['vehicles', companyId]]);
    res.status(201).json({ ok: true, id: Number(ins[0].insertId) });
  }),
);
meEmployeesRouter.patch(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = vehicleSchema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const patch: Record<string, unknown> = {};
    if (p.data.plate !== undefined) patch.plate = p.data.plate;
    if (p.data.perf !== undefined) patch.perf = p.data.perf;
    if (p.data.assignedEmployeeId !== undefined) {
      if (!(await employeeInCompany(companyId, p.data.assignedEmployeeId))) return res.status(400).json({ error: 'invalid_employee' });
      patch.assignedEmployeeId = p.data.assignedEmployeeId ?? null;
    }
    if (p.data.notes !== undefined) patch.notes = p.data.notes || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });
    const r = await db.update(companyVehicles).set(patch).where(and(eq(companyVehicles.id, id), eq(companyVehicles.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['vehicles', companyId]]);
    res.json({ ok: true });
  }),
);
meEmployeesRouter.delete(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const r = await db.delete(companyVehicles).where(and(eq(companyVehicles.id, id), eq(companyVehicles.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['vehicles', companyId]]);
    res.json({ ok: true });
  }),
);
