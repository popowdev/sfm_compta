import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { STOCK_UNIT_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { stockItems, stockMovements, stockCategories, users } from '../db/schema';
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const blank = (v: string | null | undefined) => (v ? v : null);

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'stocks');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) {
    return { ok: false as const, status: 403, error: 'forbidden' };
  }
  return {
    ok: true as const,
    canWrite: acc.canWrite,
    canCreate: acc.canCreate,
    canEdit: acc.canEdit,
    canDelete: acc.canDelete,
  };
}

function serialize(r: typeof stockItems.$inferSelect, categoryName: string | null) {
  return {
    id: r.id,
    companyId: r.companyId,
    name: r.name,
    categoryId: r.categoryId,
    categoryName,
    unit: r.unit,
    quantity: Number(r.quantity),
    unitCost: Number(r.unitCost),
    lowStockThreshold: Number(r.lowStockThreshold),
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

async function categoryInCompany(categoryId: number, companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: stockCategories.id })
    .from(stockCategories)
    .where(and(eq(stockCategories.id, categoryId), eq(stockCategories.companyId, companyId)))
    .limit(1);
  return !!rows[0];
}

const money = z.number().nonnegative().finite().max(9_999_999_999.99);
const qtyValue = z.number().finite().min(0).max(9_999_999.999);
const QTY_MAX = 999_999_999.999;

const metaSchema = z.object({
  name: z.string().trim().min(1).max(150),
  categoryId: z.number().int().positive().nullish(),
  unit: z.enum(STOCK_UNIT_KEYS as [string, ...string[]]),
  unitCost: money,
  lowStockThreshold: qtyValue,
  notes: z.string().max(2000).nullish().or(z.literal('')),
});
const itemSchema = metaSchema.extend({ quantity: qtyValue });

function toMetaRow(d: z.infer<typeof metaSchema>) {
  return {
    name: d.name,
    categoryId: d.categoryId ?? null,
    unit: d.unit as (typeof stockItems.$inferInsert)['unit'],
    unitCost: String(round2(d.unitCost)),
    lowStockThreshold: String(round3(d.lowStockThreshold)),
    notes: blank(d.notes),
  };
}

function toItemRow(d: z.infer<typeof itemSchema>) {
  return { ...toMetaRow(d), quantity: String(round3(d.quantity)) };
}

export const meStocksRouter = Router({ mergeParams: true });
meStocksRouter.use(requireAuth);

meStocksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({ item: stockItems, categoryName: stockCategories.name })
      .from(stockItems)
      .leftJoin(stockCategories, eq(stockItems.categoryId, stockCategories.id))
      .where(eq(stockItems.companyId, companyId))
      .orderBy(asc(stockItems.name));
    res.json({ canWrite: g.canWrite, items: rows.map((r) => serialize(r.item, r.categoryName)) });
  }),
);

meStocksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canDelete) return res.status(403).json({ error: 'forbidden' });
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.categoryId && !(await categoryInCompany(parsed.data.categoryId, companyId))) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    await db.insert(stockItems).values({ companyId, createdByUserId: req.user!.id, ...toItemRow(parsed.data) });
    emitInvalidate(['irs', `company:${companyId}`], [['stocks', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meStocksRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canDelete) return res.status(403).json({ error: 'forbidden' });
    const parsed = metaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.categoryId && !(await categoryInCompany(parsed.data.categoryId, companyId))) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    const result = await db
      .update(stockItems)
      .set(toMetaRow(parsed.data))
      .where(and(eq(stockItems.id, id), eq(stockItems.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['stocks', companyId]]);
    res.json({ ok: true });
  }),
);

meStocksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(stockItems)
      .where(and(eq(stockItems.id, id), eq(stockItems.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['stocks', companyId]]);
    res.json({ ok: true });
  }),
);

meStocksRouter.get(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const item = await db
      .select({ id: stockItems.id })
      .from(stockItems)
      .where(and(eq(stockItems.id, id), eq(stockItems.companyId, companyId)))
      .limit(1);
    if (!item[0]) return res.status(404).json({ error: 'not_found' });
    const rows = await db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        unitCost: stockMovements.unitCost,
        supplier: stockMovements.supplier,
        reason: stockMovements.reason,
        createdByName: users.displayName,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(users, eq(stockMovements.createdByUserId, users.id))
      .where(and(eq(stockMovements.stockItemId, id), eq(stockMovements.companyId, companyId)))
      .orderBy(desc(stockMovements.createdAt))
      .limit(100);
    res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        quantity: Number(r.quantity),
        unitCost: r.unitCost === null ? null : Number(r.unitCost),
        supplier: r.supplier,
        reason: r.reason,
        createdByName: r.createdByName,
        createdAt: r.createdAt,
      })),
    );
  }),
);

const movementSchema = z.object({
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.number().finite().min(-9_999_999.999).max(9_999_999.999),
  unitCost: money.nullish(),
  supplier: z.string().trim().max(150).nullish().or(z.literal('')),
  reason: z.string().trim().max(200).nullish().or(z.literal('')),
});

meStocksRouter.post(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const { type } = parsed.data;
    const magnitude = round3(Math.abs(parsed.data.quantity));
    if ((type === 'in' || type === 'out') && magnitude <= 0) {
      return res.status(400).json({ error: 'bad_request' });
    }
    if (type === 'adjust' && round3(parsed.data.quantity) === 0) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const delta = type === 'out' ? -magnitude : type === 'in' ? magnitude : round3(parsed.data.quantity);

    const result = await db.transaction(async (tx) => {
      const item = await tx
        .select({ quantity: stockItems.quantity })
        .from(stockItems)
        .where(and(eq(stockItems.id, id), eq(stockItems.companyId, companyId)))
        .limit(1);
      if (!item[0]) return { status: 404 as const, error: 'not_found' };
      const upd = await tx
        .update(stockItems)
        .set({ quantity: sql`${stockItems.quantity} + ${delta}` })
        .where(
          and(
            eq(stockItems.id, id),
            eq(stockItems.companyId, companyId),
            sql`${stockItems.quantity} + ${delta} >= 0`,
            sql`${stockItems.quantity} + ${delta} <= ${QTY_MAX}`,
          ),
        );
      if (!upd[0].affectedRows) {
        const projected = Number(item[0].quantity) + delta;
        return {
          status: 400 as const,
          error: projected < 0 ? 'negative_stock' : 'quantity_overflow',
        };
      }
      await tx.insert(stockMovements).values({
        companyId,
        stockItemId: id,
        type,
        quantity: String(delta),
        unitCost: type === 'in' && parsed.data.unitCost != null ? String(round2(parsed.data.unitCost)) : null,
        supplier: type === 'in' ? blank(parsed.data.supplier) : null,
        reason: blank(parsed.data.reason),
        createdByUserId: req.user!.id,
      });
      return { status: 201 as const };
    });

    if (result.status !== 201) return res.status(result.status).json({ error: result.error });
    emitInvalidate(['irs', `company:${companyId}`], [
      ['stocks', companyId],
      ['stock-movements', companyId, id],
    ]);
    res.status(201).json({ ok: true });
  }),
);
