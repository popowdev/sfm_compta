import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { PAYMENT_METHOD_KEYS, LOYALTY_TIERS, moduleConfigBool } from '@rp-compta/shared';
import { db } from '../db';
import {
  sales,
  saleItems,
  catalogItems,
  catalogRecipe,
  stockItems,
  stockMovements,
  companyEmployees,
  companyClients,
  clientLoyaltyTiers,
  companyModules,
  users,
} from '../db/schema';
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

async function saleConfig(companyId: number) {
  const rows = await db
    .select({ moduleKey: companyModules.moduleKey, config: companyModules.config })
    .from(companyModules)
    .where(
      and(
        eq(companyModules.companyId, companyId),
        inArray(companyModules.moduleKey, ['caisse', 'clients']),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.moduleKey, r.config as Record<string, unknown> | null]));
  const caisse = byKey.get('caisse') ?? null;
  const clients = byKey.get('clients') ?? null;
  return {
    stockLink: moduleConfigBool(caisse, 'caisse', 'stock'),
    clientLink: moduleConfigBool(caisse, 'caisse', 'clients'),
    discountAllowed: moduleConfigBool(caisse, 'caisse', 'discount'),
    loyaltyEnabled: moduleConfigBool(clients, 'clients', 'loyalty'),
    creditEnabled: moduleConfigBool(clients, 'clients', 'credit'),
  };
}

const MAX_AMOUNT = 999_999_999.99;

function recomputeTier(points: number, thresholds: Map<string, number>): string {
  let tier = 'bronze';
  let best = -Infinity;
  for (const t of LOYALTY_TIERS) {
    const th = thresholds.get(t.key) ?? (t.key === 'bronze' ? 0 : Infinity);
    if (points >= th && th >= best) {
      best = th;
      tier = t.key;
    }
  }
  return tier;
}

export const meSalesRouter = Router({ mergeParams: true });
meSalesRouter.use(requireAuth);

const money = z.number().nonnegative().finite().max(9_999_999_999.99);
const lineSchema = z.object({
  catalogItemId: z.number().int().positive().optional(),
  name: z.string().trim().max(150).optional(),
  unitPrice: money.optional(),
  quantity: z.number().finite().min(0.001).max(9_999_999.999),
});
const saleSchema = z.object({
  clientId: z.number().int().positive().nullish(),
  paymentMethod: z.enum(PAYMENT_METHOD_KEYS as [string, ...string[]]),
  discount: money.optional(),
  notes: z.string().trim().max(300).nullish().or(z.literal('')),
  lines: z.array(lineSchema).min(1).max(100),
});

meSalesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: sales.id,
        subtotal: sales.subtotal,
        discount: sales.discount,
        total: sales.total,
        productionCost: sales.productionCost,
        paymentMethod: sales.paymentMethod,
        notes: sales.notes,
        createdAt: sales.createdAt,
        employeeName: companyEmployees.name,
        createdByName: users.displayName,
        clientName: companyClients.name,
      })
      .from(sales)
      .leftJoin(companyEmployees, eq(sales.employeeId, companyEmployees.id))
      .leftJoin(users, eq(sales.createdByUserId, users.id))
      .leftJoin(companyClients, eq(sales.clientId, companyClients.id))
      .where(eq(sales.companyId, companyId))
      .orderBy(desc(sales.createdAt))
      .limit(100);
    res.json({
      canWrite: g.canWrite,
      sales: rows.map((r) => ({
        id: r.id,
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        total: Number(r.total),
        productionCost: Number(r.productionCost),
        margin: round2(Number(r.total) - Number(r.productionCost)),
        paymentMethod: r.paymentMethod,
        notes: r.notes,
        createdAt: r.createdAt,
        employeeName: r.employeeName ?? r.createdByName,
        clientName: r.clientName,
      })),
    });
  }),
);

meSalesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const head = await db
      .select({
        id: sales.id,
        subtotal: sales.subtotal,
        discount: sales.discount,
        total: sales.total,
        productionCost: sales.productionCost,
        paymentMethod: sales.paymentMethod,
        pointsAwarded: sales.pointsAwarded,
        notes: sales.notes,
        createdAt: sales.createdAt,
        employeeName: companyEmployees.name,
        createdByName: users.displayName,
        clientName: companyClients.name,
      })
      .from(sales)
      .leftJoin(companyEmployees, eq(sales.employeeId, companyEmployees.id))
      .leftJoin(users, eq(sales.createdByUserId, users.id))
      .leftJoin(companyClients, eq(sales.clientId, companyClients.id))
      .where(and(eq(sales.id, id), eq(sales.companyId, companyId)))
      .limit(1);
    if (!head[0]) return res.status(404).json({ error: 'not_found' });
    const lines = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, id));
    res.json({
      ...head[0],
      employeeName: head[0].employeeName ?? head[0].createdByName,
      subtotal: Number(head[0].subtotal),
      discount: Number(head[0].discount),
      total: Number(head[0].total),
      productionCost: Number(head[0].productionCost),
      lines: lines.map((l) => ({
        id: l.id,
        name: l.name,
        itemType: l.itemType,
        unitPrice: Number(l.unitPrice),
        quantity: Number(l.quantity),
        lineTotal: Number(l.lineTotal),
        productionCost: Number(l.productionCost),
      })),
    });
  }),
);

meSalesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = saleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const cfg = await saleConfig(companyId);

    if (parsed.data.paymentMethod === 'account' && (!cfg.clientLink || !cfg.creditEnabled || !parsed.data.clientId)) {
      return res.status(400).json({ error: 'credit_required' });
    }

    const catalogIds = [
      ...new Set(parsed.data.lines.map((l) => l.catalogItemId).filter((v): v is number => !!v)),
    ];
    const cItems = catalogIds.length
      ? await db
          .select()
          .from(catalogItems)
          .where(
            and(
              eq(catalogItems.companyId, companyId),
              eq(catalogItems.active, true),
              inArray(catalogItems.id, catalogIds),
            ),
          )
      : [];
    if (cItems.length !== catalogIds.length) return res.status(400).json({ error: 'invalid_item' });
    const cById = new Map(cItems.map((c) => [c.id, c]));
    const recipes = catalogIds.length
      ? await db.select().from(catalogRecipe).where(inArray(catalogRecipe.catalogItemId, catalogIds))
      : [];
    const recipeByItem = new Map<number, typeof recipes>();
    for (const r of recipes) {
      const arr = recipeByItem.get(r.catalogItemId) ?? [];
      arr.push(r);
      recipeByItem.set(r.catalogItemId, arr);
    }
    const stockCostIds = [
      ...new Set([
        ...recipes.map((r) => r.stockItemId),
        ...cItems.map((c) => c.stockItemId).filter((v): v is number => !!v),
      ]),
    ];
    const stockRows = stockCostIds.length
      ? await db
          .select({ id: stockItems.id, unitCost: stockItems.unitCost })
          .from(stockItems)
          .where(and(eq(stockItems.companyId, companyId), inArray(stockItems.id, stockCostIds)))
      : [];
    const costById = new Map(stockRows.map((s) => [s.id, Number(s.unitCost)]));

    const itemRows: (typeof saleItems.$inferInsert)[] = [];
    const consume = new Map<number, number>();
    let subtotal = 0;
    let prodCost = 0;
    for (const l of parsed.data.lines) {
      const qty = round3(l.quantity);
      if (l.catalogItemId) {
        const c = cById.get(l.catalogItemId)!;
        const unitPrice = Number(c.price);
        const lineRecipe = recipeByItem.get(c.id) ?? [];
        let lineUnitCost = 0;
        if (c.stockItemId) {
          // Produit fini stocké : on décrémente SON stock. Les matières premières ont déjà
          // été consommées lors du craft, on ne les redécompte pas à la vente.
          lineUnitCost = costById.get(c.stockItemId) ?? 0;
          if (cfg.stockLink && c.type === 'product') {
            consume.set(c.stockItemId, (consume.get(c.stockItemId) ?? 0) + qty);
          }
        } else {
          // Produit fabriqué à la volée : on décompte ses matières premières directement.
          for (const r of lineRecipe) {
            lineUnitCost += Number(r.quantity) * (costById.get(r.stockItemId) ?? 0);
            if (cfg.stockLink && c.type === 'product') {
              consume.set(r.stockItemId, (consume.get(r.stockItemId) ?? 0) + Number(r.quantity) * qty);
            }
          }
        }
        const lineCost = round2(lineUnitCost * qty);
        const lineTotal = round2(unitPrice * qty);
        if (lineTotal > MAX_AMOUNT) return res.status(400).json({ error: 'amount_too_large' });
        subtotal += lineTotal;
        prodCost += lineCost;
        itemRows.push({
          saleId: 0,
          companyId,
          catalogItemId: c.id,
          name: c.name,
          itemType: c.type,
          unitPrice: String(round2(unitPrice)),
          quantity: String(qty),
          lineTotal: String(lineTotal),
          productionCost: String(lineCost),
        });
      } else {
        if (!l.name || l.unitPrice == null) return res.status(400).json({ error: 'invalid_line' });
        const lineTotal = round2(l.unitPrice * qty);
        if (lineTotal > MAX_AMOUNT) return res.status(400).json({ error: 'amount_too_large' });
        subtotal += lineTotal;
        itemRows.push({
          saleId: 0,
          companyId,
          catalogItemId: null,
          name: l.name,
          itemType: 'service',
          unitPrice: String(round2(l.unitPrice)),
          quantity: String(qty),
          lineTotal: String(lineTotal),
          productionCost: '0',
        });
      }
    }
    subtotal = round2(subtotal);
    prodCost = round2(prodCost);
    if (subtotal > MAX_AMOUNT || prodCost > MAX_AMOUNT) {
      return res.status(400).json({ error: 'amount_too_large' });
    }
    const discount = cfg.discountAllowed ? Math.min(round2(parsed.data.discount ?? 0), subtotal) : 0;
    const total = round2(subtotal - discount);

    let clientId: number | null = null;
    let creditExceeded = false;
    if (cfg.clientLink && parsed.data.clientId) {
      const cl = await db
        .select({
          id: companyClients.id,
          accountBalance: companyClients.accountBalance,
          creditLimit: companyClients.creditLimit,
        })
        .from(companyClients)
        .where(and(eq(companyClients.id, parsed.data.clientId), eq(companyClients.companyId, companyId)))
        .limit(1);
      if (!cl[0]) return res.status(400).json({ error: 'invalid_client' });
      clientId = cl[0].id;
      if (
        parsed.data.paymentMethod === 'account' &&
        Number(cl[0].accountBalance) - total < -Number(cl[0].creditLimit)
      ) {
        creditExceeded = true;
      }
    }
    const points = clientId && cfg.loyaltyEnabled ? Math.floor(total) : 0;

    const seller = await db
      .select({ id: companyEmployees.id })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.userId, req.user!.id)))
      .limit(1);
    const employeeId = seller[0]?.id ?? null;

    const insufficient: string[] = [];
    const saleId = await db.transaction(async (tx) => {
      const ins = await tx.insert(sales).values({
        companyId,
        employeeId,
        clientId,
        subtotal: String(subtotal),
        discount: String(discount),
        total: String(total),
        productionCost: String(prodCost),
        paymentMethod: parsed.data.paymentMethod as (typeof sales.$inferInsert)['paymentMethod'],
        pointsAwarded: points,
        notes: blank(parsed.data.notes),
        createdByUserId: req.user!.id,
      });
      const newSaleId = ins[0].insertId;
      await tx.insert(saleItems).values(itemRows.map((r) => ({ ...r, saleId: newSaleId })));

      if (cfg.stockLink && consume.size > 0) {
        const ids = [...consume.keys()];
        const current = await tx
          .select({ id: stockItems.id, name: stockItems.name, quantity: stockItems.quantity })
          .from(stockItems)
          .where(and(eq(stockItems.companyId, companyId), inArray(stockItems.id, ids)));
        const curById = new Map(current.map((s) => [s.id, s]));
        for (const [stockItemId, amount] of consume) {
          const cur = curById.get(stockItemId);
          if (!cur) continue;
          const delta = round3(amount);
          const newQty = round3(Number(cur.quantity) - delta);
          if (newQty < 0) insufficient.push(cur.name);
          await tx
            .update(stockItems)
            .set({ quantity: sql`${stockItems.quantity} - ${delta}` })
            .where(and(eq(stockItems.id, stockItemId), eq(stockItems.companyId, companyId)));
          await tx.insert(stockMovements).values({
            companyId,
            stockItemId,
            type: 'out',
            quantity: String(-delta),
            reason: `Vente #${newSaleId}`,
            saleId: newSaleId,
            createdByUserId: req.user!.id,
          });
        }
      }

      if (clientId) {
        const cur = await tx
          .select({ points: companyClients.loyaltyPoints })
          .from(companyClients)
          .where(eq(companyClients.id, clientId))
          .for('update')
          .limit(1);
        const set: Record<string, unknown> = {
          totalSpent: sql`${companyClients.totalSpent} + ${total}`,
          accountBalance:
            parsed.data.paymentMethod === 'account'
              ? sql`${companyClients.accountBalance} - ${total}`
              : sql`${companyClients.accountBalance}`,
        };
        if (cfg.loyaltyEnabled) {
          const tierRows = await tx
            .select({ tier: clientLoyaltyTiers.tier, threshold: clientLoyaltyTiers.threshold })
            .from(clientLoyaltyTiers)
            .where(eq(clientLoyaltyTiers.companyId, companyId));
          const thresholds = new Map(tierRows.map((t) => [t.tier, t.threshold]));
          const newPoints = (cur[0]?.points ?? 0) + points;
          set.loyaltyPoints = sql`${companyClients.loyaltyPoints} + ${points}`;
          set.loyaltyTier = recomputeTier(newPoints, thresholds) as (typeof companyClients.$inferInsert)['loyaltyTier'];
        }
        await tx
          .update(companyClients)
          .set(set)
          .where(and(eq(companyClients.id, clientId), eq(companyClients.companyId, companyId)));
      }
      return newSaleId;
    });

    emitInvalidate(['irs', `company:${companyId}`], [
      ['sales', companyId],
      ['stocks', companyId],
      ['clients', companyId],
      ['catalog', companyId],
      ['exercices', companyId],
      ['exercice', companyId],
    ]);
    res.status(201).json({ ok: true, id: saleId, insufficient, creditExceeded });
  }),
);

meSalesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });

    const result = await db.transaction(async (tx) => {
      const saleRows = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, id), eq(sales.companyId, companyId)))
        .for('update')
        .limit(1);
      if (!saleRows[0]) return { notFound: true as const };
      const s = saleRows[0];
      const moves = await tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.companyId, companyId), eq(stockMovements.saleId, id)));
      for (const m of moves) {
        const back = -Number(m.quantity);
        await tx
          .update(stockItems)
          .set({ quantity: sql`${stockItems.quantity} + ${back}` })
          .where(and(eq(stockItems.id, m.stockItemId), eq(stockItems.companyId, companyId)));
        await tx.insert(stockMovements).values({
          companyId,
          stockItemId: m.stockItemId,
          type: 'in',
          quantity: String(round3(back)),
          reason: `Annulation vente #${id}`,
          createdByUserId: req.user!.id,
        });
      }

      if (s.clientId) {
        const tierRows = await tx
          .select({ tier: clientLoyaltyTiers.tier, threshold: clientLoyaltyTiers.threshold })
          .from(clientLoyaltyTiers)
          .where(eq(clientLoyaltyTiers.companyId, companyId));
        const thresholds = new Map(tierRows.map((t) => [t.tier, t.threshold]));
        const cur = await tx
          .select({ points: companyClients.loyaltyPoints })
          .from(companyClients)
          .where(eq(companyClients.id, s.clientId))
          .for('update')
          .limit(1);
        if (cur[0]) {
          const newPoints = Math.max(0, cur[0].points - s.pointsAwarded);
          const newTier = recomputeTier(newPoints, thresholds) as (typeof companyClients.$inferInsert)['loyaltyTier'];
          await tx
            .update(companyClients)
            .set({
              totalSpent: sql`GREATEST(0, ${companyClients.totalSpent} - ${Number(s.total)})`,
              loyaltyPoints: sql`GREATEST(0, ${companyClients.loyaltyPoints} - ${s.pointsAwarded})`,
              loyaltyTier: newTier,
              accountBalance:
                s.paymentMethod === 'account'
                  ? sql`${companyClients.accountBalance} + ${Number(s.total)}`
                  : sql`${companyClients.accountBalance}`,
            })
            .where(and(eq(companyClients.id, s.clientId), eq(companyClients.companyId, companyId)));
        }
      }

      await tx.delete(sales).where(and(eq(sales.id, id), eq(sales.companyId, companyId)));
      return { notFound: false as const };
    });

    if (result.notFound) return res.status(404).json({ error: 'not_found' });
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'sale_delete',
      targetType: 'sale',
      targetLabel: `#${id}`,
      detail: `entreprise ${companyId}`,
    });
    emitInvalidate(['irs', `company:${companyId}`], [
      ['sales', companyId],
      ['stocks', companyId],
      ['clients', companyId],
      ['exercices', companyId],
      ['exercice', companyId],
    ]);
    res.json({ ok: true });
  }),
);
