import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { chasseItems, chasseTransactions, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const priceVal = z.coerce.number().nonnegative().finite().max(999_999_999);
const qtyVal = z.coerce.number().int().min(1).max(1_000_000);

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

async function gate(req: Request, companyId: number, requireManage = false) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'chasse');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  if (requireManage && !acc.canDelete) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

async function stockByItem(companyId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({
      itemId: chasseTransactions.itemId,
      stock: sql<string>`COALESCE(SUM(CASE WHEN ${chasseTransactions.type} = 'buy' THEN ${chasseTransactions.qty} ELSE -${chasseTransactions.qty} END), 0)`,
    })
    .from(chasseTransactions)
    .where(eq(chasseTransactions.companyId, companyId))
    .groupBy(chasseTransactions.itemId);
  return new Map(rows.map((r) => [r.itemId, Number(r.stock)]));
}

export const meChasseRouter = Router({ mergeParams: true });
meChasseRouter.use(requireAuth);

meChasseRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });

    const items = await db
      .select()
      .from(chasseItems)
      .where(eq(chasseItems.companyId, companyId))
      .orderBy(asc(chasseItems.sortOrder), asc(chasseItems.name));
    const stock = await stockByItem(companyId);

    const rows = items.map((it) => {
      const s = stock.get(it.id) ?? 0;
      const buyPrice = Math.round(Number(it.buyPrice));
      const sellPrice = Math.round(Number(it.sellPrice));
      return {
        id: it.id,
        name: it.name,
        buyPrice,
        sellPrice,
        venteClient: it.venteClient,
        active: it.active,
        stock: s,
        stockValue: Math.round(s * sellPrice),
      };
    });

    const totalsRows = await db
      .select({
        type: chasseTransactions.type,
        total: sql<string>`COALESCE(SUM(${chasseTransactions.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(chasseTransactions)
      .where(eq(chasseTransactions.companyId, companyId))
      .groupBy(chasseTransactions.type);
    const buyAgg = totalsRows.find((t) => t.type === 'buy');
    const sellAgg = totalsRows.find((t) => t.type === 'sell');
    const totalBuy = Math.round(Number(buyAgg?.total ?? 0));
    const totalSell = Math.round(Number(sellAgg?.total ?? 0));
    const stockValue = rows.reduce((a, r) => a + r.stockValue, 0);

    res.json({
      canWrite: g.canWrite,
      items: rows,
      summary: {
        totalBuy,
        totalSell,
        margin: totalSell - totalBuy,
        buyCount: Number(buyAgg?.count ?? 0),
        sellCount: Number(sellAgg?.count ?? 0),
        stockValue,
        stockUnits: rows.reduce((a, r) => a + r.stock, 0),
        itemsInStock: rows.filter((r) => r.stock > 0).length,
      },
    });
  }),
);

const itemCreate = z.object({
  name: z.string().trim().min(1).max(150),
  buyPrice: priceVal,
  sellPrice: priceVal,
  venteClient: z.boolean().optional().default(false),
});
const itemPatch = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  buyPrice: priceVal.optional(),
  sellPrice: priceVal.optional(),
  venteClient: z.boolean().optional(),
  active: z.boolean().optional(),
});

meChasseRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = itemCreate.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const maxOrder = await db.select({ m: sql<number>`COALESCE(MAX(${chasseItems.sortOrder}), 0)` }).from(chasseItems).where(eq(chasseItems.companyId, companyId));
    await db.insert(chasseItems).values({
      companyId,
      name: p.data.name,
      buyPrice: String(Math.round(p.data.buyPrice)),
      sellPrice: String(Math.round(p.data.sellPrice)),
      venteClient: p.data.venteClient,
      sortOrder: Number(maxOrder[0]?.m ?? 0) + 1,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['chasse', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meChasseRouter.patch(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const p = itemPatch.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const set: Record<string, unknown> = {};
    if (p.data.name !== undefined) set.name = p.data.name;
    if (p.data.buyPrice !== undefined) set.buyPrice = String(Math.round(p.data.buyPrice));
    if (p.data.sellPrice !== undefined) set.sellPrice = String(Math.round(p.data.sellPrice));
    if (p.data.venteClient !== undefined) set.venteClient = p.data.venteClient;
    if (p.data.active !== undefined) set.active = p.data.active;
    if (!Object.keys(set).length) return res.status(400).json({ error: 'bad_request' });
    await db.update(chasseItems).set(set).where(and(eq(chasseItems.id, id), eq(chasseItems.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['chasse', companyId]]);
    res.json({ ok: true });
  }),
);

meChasseRouter.delete(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const tx = await db.select({ id: chasseTransactions.id }).from(chasseTransactions).where(and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.itemId, id))).limit(1);
    if (tx[0]) return res.status(409).json({ error: 'has_transactions' });
    await db.delete(chasseItems).where(and(eq(chasseItems.id, id), eq(chasseItems.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['chasse', companyId]]);
    res.json({ ok: true });
  }),
);

meChasseRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const type = req.query.type === 'buy' || req.query.type === 'sell' ? req.query.type : null;
    const where = type
      ? and(eq(chasseTransactions.companyId, companyId), eq(chasseTransactions.type, type))
      : eq(chasseTransactions.companyId, companyId);
    const rows = await db
      .select({
        id: chasseTransactions.id,
        itemId: chasseTransactions.itemId,
        itemName: chasseItems.name,
        type: chasseTransactions.type,
        qty: chasseTransactions.qty,
        unitPrice: chasseTransactions.unitPrice,
        total: chasseTransactions.total,
        clientName: chasseTransactions.clientName,
        note: chasseTransactions.note,
        authorName: users.displayName,
        createdAt: chasseTransactions.createdAt,
      })
      .from(chasseTransactions)
      .leftJoin(chasseItems, eq(chasseTransactions.itemId, chasseItems.id))
      .leftJoin(users, eq(chasseTransactions.createdByUserId, users.id))
      .where(where)
      .orderBy(desc(chasseTransactions.id))
      .limit(300);
    res.json({
      canWrite: g.canWrite,
      transactions: rows.map((r) => ({
        ...r,
        qty: Number(r.qty),
        unitPrice: Math.round(Number(r.unitPrice)),
        total: Math.round(Number(r.total)),
      })),
    });
  }),
);

const txCreate = z.object({
  itemId: z.coerce.number().int().positive(),
  qty: qtyVal,
  unitPrice: priceVal,
  clientName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(255).optional(),
});

async function recordTx(req: Request, res: import('express').Response, type: 'buy' | 'sell') {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req, companyId);
  if (!g.ok) return res.status(g.status).json({ error: g.error });
  const p = txCreate.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad_request' });
  const item = await db.select({ id: chasseItems.id }).from(chasseItems).where(and(eq(chasseItems.id, p.data.itemId), eq(chasseItems.companyId, companyId))).limit(1);
  if (!item[0]) return res.status(400).json({ error: 'unknown_item' });
  const qty = p.data.qty;
  if (type === 'sell') {
    const stock = await stockByItem(companyId);
    if ((stock.get(p.data.itemId) ?? 0) < qty) return res.status(409).json({ error: 'insufficient_stock' });
  }
  const unitPrice = Math.round(p.data.unitPrice);
  const total = Math.round(qty * unitPrice);
  await db.insert(chasseTransactions).values({
    companyId,
    itemId: p.data.itemId,
    type,
    qty,
    unitPrice: String(unitPrice),
    total: String(total),
    clientName: type === 'buy' ? p.data.clientName || null : null,
    note: p.data.note || null,
    createdByUserId: req.user!.id,
  });
  emitInvalidate(['irs', `company:${companyId}`], [['chasse', companyId]]);
  res.status(201).json({ ok: true, total });
}

meChasseRouter.post('/buys', asyncHandler((req, res) => recordTx(req, res, 'buy')));
meChasseRouter.post('/sells', asyncHandler((req, res) => recordTx(req, res, 'sell')));

meChasseRouter.delete(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db.select({ itemId: chasseTransactions.itemId, type: chasseTransactions.type, qty: chasseTransactions.qty }).from(chasseTransactions).where(and(eq(chasseTransactions.id, id), eq(chasseTransactions.companyId, companyId))).limit(1);
    const tx = rows[0];
    if (!tx) return res.status(404).json({ error: 'not_found' });
    if (tx.type === 'buy') {
      const stock = await stockByItem(companyId);
      if ((stock.get(tx.itemId) ?? 0) - Number(tx.qty) < 0) return res.status(409).json({ error: 'would_go_negative' });
    }
    await db.delete(chasseTransactions).where(and(eq(chasseTransactions.id, id), eq(chasseTransactions.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['chasse', companyId]]);
    res.json({ ok: true });
  }),
);
