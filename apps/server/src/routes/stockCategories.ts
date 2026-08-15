import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { stockCategories } from '../db/schema';
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
function isDuplicate(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'stocks');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) {
    return { ok: false as const, status: 403, error: 'forbidden' };
  }
  return { ok: true as const, canWrite: acc.canWrite, canManage: acc.canDelete };
}

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const meStockCategoriesRouter = Router({ mergeParams: true });
meStockCategoriesRouter.use(requireAuth);

meStockCategoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({ id: stockCategories.id, name: stockCategories.name })
      .from(stockCategories)
      .where(eq(stockCategories.companyId, companyId))
      .orderBy(asc(stockCategories.name));
    res.json({ canWrite: g.canWrite, categories: rows });
  }),
);

meStockCategoriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    try {
      await db.insert(stockCategories).values({ companyId, name: parsed.data.name });
    } catch (err) {
      if (isDuplicate(err)) return res.status(409).json({ error: 'duplicate' });
      throw err;
    }
    emitInvalidate(['irs', `company:${companyId}`], [['stock-categories', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meStockCategoriesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    try {
      const result = await db
        .update(stockCategories)
        .set({ name: parsed.data.name })
        .where(and(eq(stockCategories.id, id), eq(stockCategories.companyId, companyId)));
      if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    } catch (err) {
      if (isDuplicate(err)) return res.status(409).json({ error: 'duplicate' });
      throw err;
    }
    emitInvalidate(['irs', `company:${companyId}`], [['stock-categories', companyId], ['stocks', companyId], ['catalog', companyId]]);
    res.json({ ok: true });
  }),
);

meStockCategoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(stockCategories)
      .where(and(eq(stockCategories.id, id), eq(stockCategories.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['stock-categories', companyId], ['stocks', companyId], ['catalog', companyId]]);
    res.json({ ok: true });
  }),
);
