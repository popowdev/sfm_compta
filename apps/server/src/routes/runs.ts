import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import { companyRuns, companyEmployees, companyModules, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, canManageCompany, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}
async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'runs');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

async function runsConfig(companyId: number): Promise<{ unitPrice: number; commissionPct: number }> {
  const rows = await db.select({ config: companyModules.config }).from(companyModules).where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'runs'))).limit(1);
  const raw = rows[0]?.config;
  const cfg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
  return {
    unitPrice: moduleConfigNumber(cfg, 'runs', 'unitPrice'),
    commissionPct: moduleConfigNumber(cfg, 'runs', 'commissionPct'),
  };
}

export const meRunsRouter = Router({ mergeParams: true });
meRunsRouter.use(requireAuth);

meRunsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const canManage = await canManageCompany(req.user!.id, companyId);
    const config = await runsConfig(companyId);
    const employees = await db
      .select({ id: companyEmployees.id, name: companyEmployees.name })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)))
      .orderBy(asc(companyEmployees.name));
    const rows = await db
      .select({
        id: companyRuns.id,
        employeeId: companyRuns.employeeId,
        employeeName: companyEmployees.name,
        qty: companyRuns.qty,
        unitPrice: companyRuns.unitPrice,
        total: companyRuns.total,
        commission: companyRuns.commission,
        note: companyRuns.note,
        authorName: users.displayName,
        createdAt: companyRuns.createdAt,
      })
      .from(companyRuns)
      .leftJoin(companyEmployees, eq(companyRuns.employeeId, companyEmployees.id))
      .leftJoin(users, eq(companyRuns.createdByUserId, users.id))
      .where(eq(companyRuns.companyId, companyId))
      .orderBy(desc(companyRuns.id))
      .limit(300);
    const agg = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyRuns.total}),0)`,
        comm: sql<string>`COALESCE(SUM(${companyRuns.commission}),0)`,
        qty: sql<string>`COALESCE(SUM(${companyRuns.qty}),0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(companyRuns)
      .where(eq(companyRuns.companyId, companyId));
    const totalRevenue = Math.round(Number(agg[0]?.total ?? 0));
    const totalCommission = Math.round(Number(agg[0]?.comm ?? 0));
    res.json({
      canWrite: g.canWrite,
      canManage,
      config,
      employees,
      runs: rows.map((r) => ({
        ...r,
        qty: Number(r.qty),
        unitPrice: Math.round(Number(r.unitPrice)),
        total: Math.round(Number(r.total)),
        commission: Math.round(Number(r.commission)),
        authorName: canManage ? r.authorName : null,
        createdAt: canManage ? r.createdAt : String(r.createdAt).slice(0, 10),
      })),
      summary: {
        totalRuns: Number(agg[0]?.qty ?? 0),
        totalRevenue,
        totalCommission,
        companyShare: totalRevenue - totalCommission,
        count: Number(agg[0]?.count ?? 0),
      },
    });
  }),
);

const runSchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  qty: z.coerce.number().int().min(1).max(10_000),
  note: z.string().trim().max(255).optional(),
});

meRunsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = runSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    let employeeId: number | null = null;
    if (p.data.employeeId) {
      const emp = await db.select({ id: companyEmployees.id }).from(companyEmployees).where(and(eq(companyEmployees.id, p.data.employeeId), eq(companyEmployees.companyId, companyId))).limit(1);
      if (!emp[0]) return res.status(400).json({ error: 'unknown_employee' });
      employeeId = p.data.employeeId;
    }
    const { unitPrice, commissionPct } = await runsConfig(companyId);
    const qty = p.data.qty;
    const total = Math.round(qty * unitPrice);
    const commission = Math.round((total * commissionPct) / 100);
    await db.insert(companyRuns).values({
      companyId,
      employeeId,
      qty,
      unitPrice: String(Math.round(unitPrice)),
      total: String(total),
      commission: String(commission),
      note: p.data.note || null,
      createdByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['runs', companyId]]);
    res.status(201).json({ ok: true, total, commission });
  }),
);

meRunsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    await db.delete(companyRuns).where(and(eq(companyRuns.id, id), eq(companyRuns.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['runs', companyId]]);
    res.json({ ok: true });
  }),
);
