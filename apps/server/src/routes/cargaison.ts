import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import { companyCargaisons, cargaisonParticipants, companyEmployees, companyModules, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, canManageCompany, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';
import { bizDate, bizWeek } from '../services/bizTime';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}
async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'cargaison');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

async function cargaisonConfig(companyId: number): Promise<{ companyPct: number }> {
  const rows = await db.select({ config: companyModules.config }).from(companyModules).where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'cargaison'))).limit(1);
  const raw = rows[0]?.config;
  const cfg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
  const companyPct = Math.min(100, Math.max(0, moduleConfigNumber(cfg, 'cargaison', 'companyPct')));
  return { companyPct };
}

export const meCargaisonRouter = Router({ mergeParams: true });
meCargaisonRouter.use(requireAuth);

meCargaisonRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const canManage = await canManageCompany(req.user!.id, companyId);
    const config = await cargaisonConfig(companyId);

    const offset = Number.isFinite(Number(req.query.offset)) ? Math.min(0, Math.trunc(Number(req.query.offset))) : 0;
    const { monday: weekStart, sunday: weekEnd, label: weekLabel } = bizWeek(new Date(), offset);
    const inWeek = and(gte(bizDate(companyCargaisons.createdAt), weekStart), lte(bizDate(companyCargaisons.createdAt), weekEnd));

    const employees = await db
      .select({ id: companyEmployees.id, name: companyEmployees.name })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)))
      .orderBy(asc(companyEmployees.name));

    const rows = await db
      .select({
        id: companyCargaisons.id,
        clientName: companyCargaisons.clientName,
        blNumber: companyCargaisons.blNumber,
        product: companyCargaisons.product,
        qty: companyCargaisons.qty,
        total: companyCargaisons.total,
        importCost: companyCargaisons.importCost,
        employeeShare: companyCargaisons.employeeShare,
        companyShare: companyCargaisons.companyShare,
        participantCount: companyCargaisons.participantCount,
        note: companyCargaisons.note,
        authorName: users.displayName,
        createdAt: companyCargaisons.createdAt,
      })
      .from(companyCargaisons)
      .leftJoin(users, eq(companyCargaisons.createdByUserId, users.id))
      .where(and(eq(companyCargaisons.companyId, companyId), inWeek))
      .orderBy(desc(companyCargaisons.id))
      .limit(300);

    const ids = rows.map((r) => r.id);
    const partRows = ids.length
      ? await db
          .select({
            cargaisonId: cargaisonParticipants.cargaisonId,
            employeeId: cargaisonParticipants.employeeId,
            employeeName: companyEmployees.name,
            share: cargaisonParticipants.share,
          })
          .from(cargaisonParticipants)
          .leftJoin(companyEmployees, eq(cargaisonParticipants.employeeId, companyEmployees.id))
          .where(inArray(cargaisonParticipants.cargaisonId, ids))
      : [];
    const partByCargaison = new Map<number, { employeeId: number | null; name: string | null; share: number }[]>();
    for (const p of partRows) {
      const arr = partByCargaison.get(p.cargaisonId) ?? [];
      arr.push({ employeeId: p.employeeId, name: p.employeeName, share: Math.round(Number(p.share)) });
      partByCargaison.set(p.cargaisonId, arr);
    }

    const agg = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyCargaisons.total}),0)`,
        empShare: sql<string>`COALESCE(SUM(${companyCargaisons.employeeShare}),0)`,
        compShare: sql<string>`COALESCE(SUM(${companyCargaisons.companyShare}),0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(companyCargaisons)
      .where(and(eq(companyCargaisons.companyId, companyId), inWeek));
    const totalRevenue = Math.round(Number(agg[0]?.total ?? 0));
    const totalEmployee = Math.round(Number(agg[0]?.empShare ?? 0));
    const totalCompany = Math.round(Number(agg[0]?.compShare ?? 0));

    res.json({
      canWrite: g.canWrite,
      canManage,
      config,
      week: { offset, label: weekLabel, start: weekStart, end: weekEnd },
      employees,
      cargaisons: rows.map((r) => ({
        id: r.id,
        clientName: r.clientName,
        blNumber: r.blNumber,
        product: r.product,
        qty: Number(r.qty),
        total: Math.round(Number(r.total)),
        importCost: Math.round(Number(r.importCost)),
        employeeShare: Math.round(Number(r.employeeShare)),
        companyShare: Math.round(Number(r.companyShare)),
        participantCount: Number(r.participantCount),
        participants: partByCargaison.get(r.id) ?? [],
        note: r.note,
        authorName: canManage ? r.authorName : null,
        createdAt: canManage ? r.createdAt : String(r.createdAt).slice(0, 10),
      })),
      summary: {
        totalRevenue,
        totalEmployee,
        totalCompany,
        count: Number(agg[0]?.count ?? 0),
      },
    });
  }),
);

const cargaisonSchema = z.object({
  clientName: z.string().trim().min(1).max(120),
  blNumber: z.string().trim().max(60).optional(),
  product: z.string().trim().max(150).optional(),
  qty: z.coerce.number().int().min(1).max(1_000_000).default(1),
  total: z.coerce.number().int().min(1).max(1_000_000_000),
  importCost: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  participantIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
  note: z.string().trim().max(255).optional(),
});

meCargaisonRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    const p = cargaisonSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });

    const ids = [...new Set(p.data.participantIds)];
    let validIds: number[] = [];
    if (ids.length) {
      const emps = await db
        .select({ id: companyEmployees.id })
        .from(companyEmployees)
        .where(and(inArray(companyEmployees.id, ids), eq(companyEmployees.companyId, companyId), eq(companyEmployees.active, true)));
      const okSet = new Set(emps.map((e) => e.id));
      validIds = ids.filter((id) => okSet.has(id));
      if (validIds.length !== ids.length) return res.status(400).json({ error: 'unknown_employee' });
    }

    const { companyPct } = await cargaisonConfig(companyId);
    const total = Math.round(p.data.total);
    const importCost = Math.min(Math.round(p.data.importCost), total);
    const base = Math.max(0, total - importCost);
    const pool = Math.round((base * (100 - companyPct)) / 100);
    const n = validIds.length;
    const share = n > 0 ? Math.floor(pool / n) : 0;
    const employeeShare = share * n;
    const companyShare = base - employeeShare;

    const ins = await db.insert(companyCargaisons).values({
      companyId,
      clientName: p.data.clientName,
      blNumber: p.data.blNumber || '',
      product: p.data.product || '',
      qty: p.data.qty,
      total: String(total),
      importCost: String(importCost),
      employeeShare: String(employeeShare),
      companyShare: String(companyShare),
      participantCount: n,
      note: p.data.note || null,
      createdByUserId: req.user!.id,
    });
    const cargaisonId = ins[0].insertId;
    if (n > 0) {
      await db.insert(cargaisonParticipants).values(
        validIds.map((employeeId) => ({ companyId, cargaisonId, employeeId, share: String(share) })),
      );
    }
    emitInvalidate(['irs', `company:${companyId}`], [['cargaison', companyId]]);
    res.status(201).json({ ok: true, total, importCost, employeeShare, companyShare, sharePerEmployee: share });
  }),
);

meCargaisonRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!(await canManageCompany(req.user!.id, companyId))) return res.status(403).json({ error: 'forbidden' });
    await db.delete(companyCargaisons).where(and(eq(companyCargaisons.id, id), eq(companyCargaisons.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['cargaison', companyId]]);
    res.json({ ok: true });
  }),
);
