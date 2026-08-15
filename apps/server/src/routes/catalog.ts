import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { CATALOG_ITEM_TYPES } from '@rp-compta/shared';
import { db } from '../db';
import { catalogItems, catalogRecipe, stockItems, stockCategories, stockMovements } from '../db/schema';
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
  return { ok: true as const, canWrite: acc.canWrite, canManage: acc.canDelete };
}

const TYPE_KEYS = CATALOG_ITEM_TYPES.map((t) => t.key) as [string, ...string[]];
const money = z.number().nonnegative().finite().max(9_999_999_999.99);

const itemSchema = z.object({
  name: z.string().trim().min(1).max(150),
  categoryId: z.number().int().positive().nullish(),
  ownStock: z.boolean().optional(),
  stockQuantity: z.number().min(0).max(9_999_999).nullish(),
  type: z.enum(TYPE_KEYS),
  price: money,
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullish().or(z.literal('')),
});

function toItemRow(d: z.infer<typeof itemSchema>) {
  return {
    name: d.name,
    categoryId: d.categoryId ?? null,
    type: d.type as (typeof catalogItems.$inferInsert)['type'],
    price: String(round2(d.price)),
    active: d.active ?? true,
    notes: blank(d.notes),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Gère le stock propre d'un produit : crée/maj un article de stock dédié, ou le délie.
async function syncOwnStock(
  tx: Tx,
  companyId: number,
  catalogItemId: number,
  currentStockId: number | null,
  d: z.infer<typeof itemSchema>,
): Promise<void> {
  const wantStock = d.type === 'product' && d.ownStock === true;
  const qty = round3(d.stockQuantity ?? 0);
  if (wantStock) {
    if (currentStockId) {
      await tx
        .update(stockItems)
        .set({ quantity: String(qty), name: d.name.slice(0, 150) })
        .where(and(eq(stockItems.id, currentStockId), eq(stockItems.companyId, companyId)));
    } else {
      const ins = await tx
        .insert(stockItems)
        .values({ companyId, name: d.name.slice(0, 150), unit: 'piece', quantity: String(qty), unitCost: '0' });
      await tx
        .update(catalogItems)
        .set({ stockItemId: Number(ins[0].insertId) })
        .where(eq(catalogItems.id, catalogItemId));
    }
  } else if (currentStockId) {
    // On délie (on garde l'article de stock pour l'historique).
    await tx.update(catalogItems).set({ stockItemId: null }).where(eq(catalogItems.id, catalogItemId));
  }
}

async function categoryInCompany(categoryId: number, companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: stockCategories.id })
    .from(stockCategories)
    .where(and(eq(stockCategories.id, categoryId), eq(stockCategories.companyId, companyId)))
    .limit(1);
  return !!rows[0];
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
    const cats = await db
      .select({ id: stockCategories.id, name: stockCategories.name })
      .from(stockCategories)
      .where(eq(stockCategories.companyId, companyId));
    const catMap = new Map(cats.map((c) => [c.id, c.name]));

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
      // Produit stocké directement (produit fini, sans matière première) : son coût = coût unitaire de son article de stock.
      const directStock = it.stockItemId ? stockById.get(it.stockItemId) : null;
      if (directStock) costSum += Number(directStock.unitCost);
      const price = Number(it.price);
      const productionCost = stocksVisible ? round2(costSum) : null;
      return {
        id: it.id,
        name: it.name,
        categoryId: it.categoryId,
        categoryName: it.categoryId ? (catMap.get(it.categoryId) ?? null) : null,
        stockItemId: it.stockItemId,
        stockItemName: directStock?.name ?? null,
        stockQuantity: directStock ? Number(directStock.quantity) : null,
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
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.categoryId && !(await categoryInCompany(parsed.data.categoryId, companyId))) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    const newId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(catalogItems)
        .values({ companyId, createdByUserId: req.user!.id, ...toItemRow(parsed.data) });
      const cid = Number(inserted[0].insertId);
      await syncOwnStock(tx, companyId, cid, null, parsed.data);
      return cid;
    });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId], ['stocks', companyId]]);
    res.status(201).json({ ok: true, id: newId });
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
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (parsed.data.categoryId && !(await categoryInCompany(parsed.data.categoryId, companyId))) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    const exists = await db
      .select({ id: catalogItems.id, stockItemId: catalogItems.stockItemId })
      .from(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)))
      .limit(1);
    if (!exists[0]) return res.status(404).json({ error: 'not_found' });
    const prevStockId = exists[0].stockItemId ?? null;
    await db.transaction(async (tx) => {
      await tx
        .update(catalogItems)
        .set(toItemRow(parsed.data))
        .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)));
      if (parsed.data.type !== 'product') {
        await tx.delete(catalogRecipe).where(eq(catalogRecipe.catalogItemId, id));
      }
      await syncOwnStock(tx, companyId, id, prevStockId, parsed.data);
    });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId], ['stocks', companyId]]);
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
    if (!g.canManage) return res.status(403).json({ error: 'forbidden' });
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

const craftSchema = z.object({
  lines: z
    .array(
      z.object({
        catalogItemId: z.number().int().positive(),
        quantity: z.number().finite().positive().max(100000),
      }),
    )
    .min(1)
    .max(50),
});

// Craft : fabrique des produits finis. Retire les matières premières (recette × qté)
// et ajoute la quantité produite au stock du produit fini (son article de stock lié).
meCatalogRouter.post(
  '/craft',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'stocks');
    if (!acc || !acc.enabled || acc.blocked || !acc.canView) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (actionDenied(acc, 'write' as PermAction)) return res.status(403).json({ error: 'forbidden' });

    const parsed = craftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    // Agrège les quantités par produit (au cas où le même produit apparaît 2 fois).
    const wanted = new Map<number, number>();
    for (const l of parsed.data.lines) {
      wanted.set(l.catalogItemId, round3((wanted.get(l.catalogItemId) ?? 0) + l.quantity));
    }
    const itemIds = [...wanted.keys()];

    const items = await db
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.companyId, companyId), inArray(catalogItems.id, itemIds)));
    if (items.length !== itemIds.length) return res.status(400).json({ error: 'invalid_item' });

    const recipes = await db
      .select()
      .from(catalogRecipe)
      .where(inArray(catalogRecipe.catalogItemId, itemIds));
    const recipeByItem = new Map<number, typeof recipes>();
    for (const r of recipes) {
      const arr = recipeByItem.get(r.catalogItemId) ?? [];
      arr.push(r);
      recipeByItem.set(r.catalogItemId, arr);
    }

    // Chaque produit craftable doit avoir une recette ET un article de stock produit fini.
    for (const it of items) {
      if (it.type !== 'product' || !it.stockItemId || (recipeByItem.get(it.id) ?? []).length === 0) {
        return res.status(400).json({ error: 'not_craftable', item: it.name });
      }
    }

    // Consommation nette de matières premières sur l'ensemble du craft.
    const consume = new Map<number, number>();
    for (const it of items) {
      const n = wanted.get(it.id)!;
      for (const r of recipeByItem.get(it.id) ?? []) {
        consume.set(r.stockItemId, round3((consume.get(r.stockItemId) ?? 0) + Number(r.quantity) * n));
      }
    }
    // Production ajoutée au stock des produits finis.
    const produce = new Map<number, number>();
    for (const it of items) produce.set(it.stockItemId!, round3(wanted.get(it.id)!));

    const stockIds = [...new Set([...consume.keys(), ...produce.keys()])];
    const stocks = await db
      .select({ id: stockItems.id, name: stockItems.name, quantity: stockItems.quantity })
      .from(stockItems)
      .where(and(eq(stockItems.companyId, companyId), inArray(stockItems.id, stockIds)));
    const byId = new Map(stocks.map((s) => [s.id, s]));

    // Vérifie qu'on a assez de matières premières AVANT de rien modifier.
    const short: string[] = [];
    for (const [sid, amount] of consume) {
      const cur = byId.get(sid);
      if (!cur || round3(Number(cur.quantity) - amount) < 0) short.push(cur?.name ?? `#${sid}`);
    }
    if (short.length) return res.status(409).json({ error: 'insufficient_stock', items: short });

    await db.transaction(async (tx) => {
      for (const [sid, amount] of consume) {
        await tx
          .update(stockItems)
          .set({ quantity: sql`${stockItems.quantity} - ${amount}` })
          .where(and(eq(stockItems.id, sid), eq(stockItems.companyId, companyId)));
        await tx.insert(stockMovements).values({
          companyId,
          stockItemId: sid,
          type: 'out',
          quantity: String(-amount),
          reason: 'Craft (matière première)',
          createdByUserId: req.user!.id,
        });
      }
      for (const [sid, amount] of produce) {
        await tx
          .update(stockItems)
          .set({ quantity: sql`${stockItems.quantity} + ${amount}` })
          .where(and(eq(stockItems.id, sid), eq(stockItems.companyId, companyId)));
        await tx.insert(stockMovements).values({
          companyId,
          stockItemId: sid,
          type: 'in',
          quantity: String(amount),
          reason: 'Craft (production)',
          createdByUserId: req.user!.id,
        });
      }
    });

    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId], ['stocks', companyId]]);
    res.json({ ok: true, crafted: itemIds.length });
  }),
);

const stockAdjustSchema = z.object({ delta: z.number().finite().refine((n) => n !== 0, 'delta non nul') });

// Ajuste le stock propre d'un article (+ ajoute / − retire). Crée l'article de stock au 1er ajout.
meCatalogRouter.post(
  '/:id/stock',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const parsed = stockAdjustSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const delta = round3(parsed.data.delta);

    const rows = await db
      .select({ id: catalogItems.id, name: catalogItems.name, type: catalogItems.type, stockItemId: catalogItems.stockItemId })
      .from(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.companyId, companyId)))
      .limit(1);
    const it = rows[0];
    if (!it) return res.status(404).json({ error: 'not_found' });
    if (it.type !== 'product') return res.status(400).json({ error: 'not_a_product' });

    const newQty = await db.transaction(async (tx) => {
      let stockId = it.stockItemId;
      let current = 0;
      if (stockId) {
        const s = await tx.select({ q: stockItems.quantity }).from(stockItems).where(eq(stockItems.id, stockId)).limit(1);
        current = Number(s[0]?.q ?? 0);
      }
      const next = round3(current + delta);
      if (next < 0) throw new Error('negative');
      if (stockId) {
        await tx.update(stockItems).set({ quantity: String(next) }).where(eq(stockItems.id, stockId));
      } else {
        const ins = await tx
          .insert(stockItems)
          .values({ companyId, name: it.name.slice(0, 150), unit: 'piece', quantity: String(next), unitCost: '0' });
        stockId = Number(ins[0].insertId);
        await tx.update(catalogItems).set({ stockItemId: stockId }).where(eq(catalogItems.id, id));
      }
      await tx.insert(stockMovements).values({
        companyId,
        stockItemId: stockId,
        type: delta >= 0 ? 'in' : 'out',
        quantity: String(delta),
        reason: 'Ajustement manuel (article)',
        createdByUserId: req.user!.id,
      });
      return next;
    }).catch((e) => {
      if (e instanceof Error && e.message === 'negative') return null;
      throw e;
    });

    if (newQty === null) return res.status(409).json({ error: 'insufficient_stock' });
    emitInvalidate(['irs', `company:${companyId}`], [['catalog', companyId], ['stocks', companyId]]);
    res.json({ ok: true, quantity: newQty });
  }),
);
