import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { CATALOG_ITEM_TYPES } from '@rp-compta/shared';
import { db } from '../db';
import { catalogItems, catalogRecipe, stockItems } from '../db/schema';
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
  const acc = await getModuleAccess(req.user!.id, companyId, 'caisse');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) {
    return { ok: false as const, status: 403, error: 'forbidden' };
  }
  return { ok: true as const, canWrite: acc.canWrite };
}

const TYPE_KEYS = CATALOG_ITEM_TYPES.map((t) => t.key) as [string, ...string[]];
const money = z.number().nonnegative().finite().max(9_999_999_999.99);

const itemSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().max(80).nullish().or(z.literal('')),
  type: z.enum(TYPE_KEYS),
  price: money,
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullish().or(z.literal('')),
});

function toItemRow(d: z.infer<typeof itemSchema>) {
  return {
    name: d.name,
    category: blank(d.category),
    type: d.type as (typeof catalogItems.$inferInsert)['type'],
    price: String(round2(d.price)),
    active: d.active ?? true,
    notes: blank(d.notes),
  };
}

export const meCatalogRouter = Router({ mergeParams: true });
meCatalogRouter.use(requireAuth);

meCatalogRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });

    const stocksAcc = await getModuleAccess(req.user!.id, companyId, 'stocks');
    const stocksVisible =
      !!stocksAcc && stocksAcc.enabled && !stocksAcc.blocked && stocksAcc.canView;

    const items = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.companyId, companyId))
      .orderBy(asc(catalogItems.name));
    const stocks = await db
      .select({
        id: stockItems.id,
        name: stockItems.name,
        unit: stockItems.unit,
        unitCost: stockItems.unitCost,
        quantity: stockItems.quantity,
      })
      .from(stockItems)
      .where(eq(stockItems.companyId, companyId))
      .orderBy(asc(stockItems.name));
    const stockById = new Map(stocks.map((s) => [s.id, s]));

    const itemIds = items.map((i) => i.id);
    const recipes = itemIds.length
      ? await db.select().from(catalogRecipe).where(inArray(catalogRecipe.catalogItemId, itemIds))
      : [];
    const recipeByItem = new Map<number, typeof recipes>();
    for (const r of recipes) {
      const arr = recipeByItem.get(r.catalogItemId) ?? [];
      arr.push(r);
      recipeByItem.set(r.catalogItemId, arr);
    }

    const out = items.map((it) => {
      let costSum = 0;
      const lines = (recipeByItem.get(it.id) ?? []).map((r) => {
        const s = stockById.get(r.stockItemId);
        const qty = Number(r.quantity);
        const unitCost = s ? Number(s.unitCost) : 0;
        costSum += qty * unitCost;
        return {
          stockItemId: r.stockItemId,
          stockName: s?.name ?? '—',
          unit: s?.unit ?? null,
          quantity: qty,
          unitCost: stocksVisible ? unitCost : null,
          lineCost: stocksVisible ? round2(qty * unitCost) : null,
        };
      });
      const price = Number(it.price);
      const productionCost = stocksVisible ? round2(costSum) : null;
      return {
        id: it.id,
        name: it.name,
        category: it.category,
        type: it.type,
        price,
        active: it.active,
        notes: it.notes,
        createdAt: it.createdAt,
        recipe: lines,
        productionCost,
        margin: stocksVisible ? round2(price - costSum) : null,
      };
    });

    res.json({
      canWrite: g.canWrite,
      stocksVisible,
      items: out,
      stockItems: stocksVisible
        ? stocks.map((s) => ({
            id: s.id,
            name: s.name,
            unit: s.unit,
            unitCost: Number(s.unitCost),
            quantity: Number(s.quantity),
          }))
        : [],
    });
  }),
);

meCatalogRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.insert(catalogItems).values({ companyId, createdByUserId: req.user!.id, ...toItemRow(parsed.data) });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meCatalogRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const exists = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)))
      .limit(1);
    if (!exists[0]) return res.status(404).json({ error: 'not_found' });
    await db.transaction(async (tx) => {
      await tx
        .update(catalogItems)
        .set(toItemRow(parsed.data))
        .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)));
      if (parsed.data.type !== 'product') {
        await tx.delete(catalogRecipe).where(eq(catalogRecipe.catalogItemId, id));
      }
    });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId]]);
    res.json({ ok: true });
  }),
);

meCatalogRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId]]);
    res.json({ ok: true });
  }),
);

const recipeSchema = z.object({
  lines: z
    .array(
      z.object({
        stockItemId: z.number().int().positive(),
        quantity: z.number().finite().min(0.001).max(9_999_999.999),
      }),
    )
    .max(50),
});

meCatalogRouter.put(
  '/:id/recipe',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = recipeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    const item = await db
      .select({ id: catalogItems.id, type: catalogItems.type })
      .from(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)))
      .limit(1);
    if (!item[0]) return res.status(404).json({ error: 'not_found' });
    if (item[0].type !== 'product' && parsed.data.lines.length > 0) {
      return res.status(400).json({ error: 'service_no_recipe' });
    }

    const ids = [...new Set(parsed.data.lines.map((l) => l.stockItemId))];
    if (ids.length !== parsed.data.lines.length) return res.status(400).json({ error: 'duplicate_component' });
    if (ids.length) {
      const owned = await db
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(and(eq(stockItems.companyId, companyId), inArray(stockItems.id, ids)));
      if (owned.length !== ids.length) return res.status(400).json({ error: 'invalid_component' });
    }

    await db.transaction(async (tx) => {
      await tx.delete(catalogRecipe).where(eq(catalogRecipe.catalogItemId, id));
      if (parsed.data.lines.length) {
        await tx.insert(catalogRecipe).values(
          parsed.data.lines.map((l) => ({
            companyId,
            catalogItemId: id,
            stockItemId: l.stockItemId,
            quantity: String(round3(l.quantity)),
          })),
        );
      }
    });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId]]);
    res.json({ ok: true });
  }),
);
