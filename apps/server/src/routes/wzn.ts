import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { wznArticles } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitCompta } from '../realtime/socket';
import { bizWeek } from '../services/bizTime';
import { addWeeks, mondayOf, wznWeek } from '../services/wzn';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'wzn');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite, canCreate: acc.canCreate, canEdit: acc.canEdit, canManage: acc.canDelete };
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const meWznRouter = Router({ mergeParams: true });
meWznRouter.use(requireAuth);

meWznRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const { monday } = bizWeek();
    const week = typeof req.query.week === 'string' && dateRe.test(req.query.week) ? req.query.week : monday;
    const data = await wznWeek(companyId, week);
    res.json({ week, canWrite: g.canWrite, canCreate: g.canCreate, canEdit: g.canEdit, canManage: g.canManage, ...data });
  }),
);

const articleSchema = z.object({
  title: z.string().trim().min(1).max(150),
  type: z.enum(['video', 'ecrit']),
  likes: z.coerce.number().int().min(0).max(1000000).optional(),
  startWeek: z.string().regex(dateRe).optional(),
  notes: z.string().trim().max(255).optional(),
});

meWznRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = articleSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const { config } = await wznWeek(companyId, bizWeek().monday);
    const start = mondayOf(p.data.startWeek ?? addWeeks(bizWeek().monday, 1));
    await db.insert(wznArticles).values({
      companyId,
      title: p.data.title,
      type: p.data.type,
      likes: p.data.likes ?? 0,
      startWeek: start,
      weeks: config.weeks,
      notes: p.data.notes || null,
      createdByUserId: req.user!.id,
    });
    emitCompta(companyId, [['wzn', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  type: z.enum(['video', 'ecrit']).optional(),
  likes: z.coerce.number().int().min(0).max(1000000).optional(),
  startWeek: z.string().regex(dateRe).optional(),
  notes: z.string().trim().max(255).nullish(),
});

meWznRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = patchSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const set: Record<string, unknown> = {};
    if (p.data.title !== undefined) set.title = p.data.title;
    if (p.data.type !== undefined) set.type = p.data.type;
    if (p.data.likes !== undefined) set.likes = p.data.likes;
    if (p.data.startWeek !== undefined) set.startWeek = mondayOf(p.data.startWeek);
    if (p.data.notes !== undefined) set.notes = p.data.notes || null;
    if (Object.keys(set).length === 0) return res.json({ ok: true });
    const r = await db
      .update(wznArticles)
      .set(set)
      .where(and(eq(wznArticles.id, id), eq(wznArticles.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['wzn', companyId]]);
    res.json({ ok: true });
  }),
);

meWznRouter.put(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const p = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const r = await db
      .update(wznArticles)
      .set({ active: p.data.active })
      .where(and(eq(wznArticles.id, id), eq(wznArticles.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['wzn', companyId]]);
    res.json({ ok: true });
  }),
);

meWznRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const r = await db.delete(wznArticles).where(and(eq(wznArticles.id, id), eq(wznArticles.companyId, companyId)));
    if (!r[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['wzn', companyId]]);
    res.json({ ok: true });
  }),
);
