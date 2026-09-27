import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { shareListings, shareRequests, shareholders, companies, memberships, companyRoles } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { isStaff, canManageCompany } from '../services/access';
import { notify, companyManagerUserIds } from '../services/notifications';
import { emitInvalidate, emitInvalidateAll } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const parts = z.number().positive().max(100);

async function manageableCompanyIds(userId: number, staff: boolean): Promise<Set<number>> {
  if (staff) {
    const rows = await db.select({ id: companies.id }).from(companies);
    return new Set(rows.map((r) => r.id));
  }
  const rows = await db
    .select({ companyId: memberships.companyId })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true), eq(companyRoles.canManage, true)));
  return new Set(rows.map((r) => r.companyId));
}

export const meShareListingsRouter = Router();
meShareListingsRouter.use(requireAuth);

meShareListingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const staff = await isStaff(req.user!.id);
    const manageable = await manageableCompanyIds(req.user!.id, staff);
    const rows = await db
      .select({
        l: shareListings,
        companyName: companies.name,
        sellerName: shareholders.name,
        sellerAnonymous: shareholders.anonymous,
        sellerPublicName: shareholders.publicName,
      })
      .from(shareListings)
      .innerJoin(companies, eq(shareListings.companyId, companies.id))
      .leftJoin(shareholders, eq(shareListings.sellerShareholderId, shareholders.id))
      .where(eq(shareListings.status, 'open'))
      .orderBy(desc(shareListings.createdAt));

    const ids = rows.map((r) => r.l.id);
    const reqRows = ids.length
      ? await db.select().from(shareRequests).where(inArray(shareRequests.listingId, ids))
      : [];
    const reqByListing = new Map<number, typeof reqRows>();
    for (const rq of reqRows) {
      const arr = reqByListing.get(rq.listingId) ?? [];
      arr.push(rq);
      reqByListing.set(rq.listingId, arr);
    }

    res.json({
      listings: rows.map((r) => {
        const mine = manageable.has(r.l.companyId);
        const reqs = reqByListing.get(r.l.id) ?? [];
        return {
          id: r.l.id,
          companyId: r.l.companyId,
          companyName: r.companyName,
          sellerName:
            r.sellerAnonymous && !mine
              ? r.sellerPublicName || 'Actionnaire anonyme'
              : r.sellerName,
          parts: Number(r.l.parts),
          pricePerPart: Number(r.l.pricePerPart),
          note: r.l.note,
          status: r.l.status,
          createdAt: r.l.createdAt,
          mine,
          myRequest: reqs.find((rq) => rq.buyerUserId === req.user!.id && rq.status === 'pending') ? true : false,
          pendingCount: reqs.filter((rq) => rq.status === 'pending').length,
          requests: mine
            ? reqs
                .sort((a, b) => b.id - a.id)
                .map((rq) => ({ id: rq.id, buyerName: rq.buyerName, parts: Number(rq.parts), status: rq.status, createdAt: rq.createdAt }))
            : [],
        };
      }),
    });
  }),
);

const createSchema = z.object({
  companyId: z.number().int().positive(),
  sellerShareholderId: z.number().int().positive(),
  parts,
  pricePerPart: z.number().nonnegative().finite().max(999_999_999.99),
  note: z.string().trim().max(250).nullish().or(z.literal('')),
});

meShareListingsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    if (!(await canManageCompany(req.user!.id, d.companyId))) return res.status(403).json({ error: 'forbidden' });
    const seller = await db
      .select({ id: shareholders.id, percentage: shareholders.percentage })
      .from(shareholders)
      .where(and(eq(shareholders.id, d.sellerShareholderId), eq(shareholders.companyId, d.companyId)))
      .limit(1);
    if (!seller[0]) return res.status(400).json({ error: 'invalid_seller' });
    if (Number(seller[0].percentage) < d.parts) return res.status(400).json({ error: 'not_enough_parts' });
    await db.insert(shareListings).values({
      companyId: d.companyId,
      sellerShareholderId: d.sellerShareholderId,
      parts: String(round2(d.parts)),
      pricePerPart: String(round2(d.pricePerPart)),
      note: d.note ? d.note : null,
      createdByUserId: req.user!.id,
    });
    emitInvalidateAll([['share-listings']]);
    res.status(201).json({ ok: true });
  }),
);

meShareListingsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const l = await db.select({ companyId: shareListings.companyId }).from(shareListings).where(eq(shareListings.id, id)).limit(1);
    if (!l[0]) return res.status(404).json({ error: 'not_found' });
    if (!(await canManageCompany(req.user!.id, l[0].companyId)) && !(await isStaff(req.user!.id))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    await db.delete(shareListings).where(eq(shareListings.id, id));
    emitInvalidateAll([['share-listings']]);
    res.json({ ok: true });
  }),
);

const requestSchema = z.object({ parts, buyerName: z.string().trim().min(1).max(120) });

meShareListingsRouter.post(
  '/:id/request',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const l = await db.select().from(shareListings).where(eq(shareListings.id, id)).limit(1);
    if (!l[0] || l[0].status !== 'open') return res.status(404).json({ error: 'not_found' });
    if (parsed.data.parts > Number(l[0].parts)) return res.status(400).json({ error: 'too_many_parts' });
    if (await canManageCompany(req.user!.id, l[0].companyId)) return res.status(400).json({ error: 'own_listing' });
    await db.insert(shareRequests).values({
      listingId: id,
      buyerUserId: req.user!.id,
      buyerName: parsed.data.buyerName,
      parts: String(round2(parsed.data.parts)),
    });
    emitInvalidate([`company:${l[0].companyId}`, 'irs'], [['share-listings']]);
    await notify(await companyManagerUserIds(l[0].companyId), {
      type: 'share_request',
      title: 'Demande d’achat de parts',
      body: `${parsed.data.buyerName} — ${parsed.data.parts} part(s)`,
      link: '/bourse',
    });
    res.status(201).json({ ok: true });
  }),
);

async function decideRequest(req: Request, accept: boolean) {
  const rid = parseId(req.params.rid);
  if (!rid) return { ok: false as const, status: 400, error: 'bad_request' };
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ rq: shareRequests, l: shareListings })
      .from(shareRequests)
      .innerJoin(shareListings, eq(shareRequests.listingId, shareListings.id))
      .where(eq(shareRequests.id, rid))
      .for('update')
      .limit(1);
    if (!rows[0]) return { ok: false as const, status: 404, error: 'not_found' };
    const { rq, l } = rows[0];
    if (rq.status !== 'pending') return { ok: false as const, status: 409, error: 'already_decided' };
    if (!(await canManageCompany(req.user!.id, l.companyId)) && !(await isStaff(req.user!.id))) {
      return { ok: false as const, status: 403, error: 'forbidden' };
    }
    if (!accept) {
      await tx.update(shareRequests).set({ status: 'refused' }).where(eq(shareRequests.id, rid));
      return { ok: true as const, companyId: l.companyId, buyerUserId: rq.buyerUserId, accepted: false };
    }
    const reqParts = Number(rq.parts);
    if (l.status !== 'open' || reqParts > Number(l.parts)) return { ok: false as const, status: 400, error: 'unavailable' };

    if (!l.sellerShareholderId) {
      return { ok: false as const, status: 409, error: 'seller_gone' };
    }
    const seller = await tx
      .select({ id: shareholders.id, name: shareholders.name, percentage: shareholders.percentage })
      .from(shareholders)
      .where(eq(shareholders.id, l.sellerShareholderId))
      .for('update')
      .limit(1);
    if (!seller[0] || Number(seller[0].percentage) < reqParts) {
      return { ok: false as const, status: 400, error: 'seller_insufficient' };
    }
    await tx
      .update(shareholders)
      .set({ percentage: String(round2(Number(seller[0].percentage) - reqParts)) })
      .where(eq(shareholders.id, l.sellerShareholderId));

    const buyerExisting = await tx
      .select({ id: shareholders.id, percentage: shareholders.percentage })
      .from(shareholders)
      .where(and(eq(shareholders.companyId, l.companyId), eq(shareholders.name, rq.buyerName)))
      .limit(1);
    if (buyerExisting[0]) {
      await tx
        .update(shareholders)
        .set({ percentage: String(round2(Number(buyerExisting[0].percentage) + reqParts)) })
        .where(eq(shareholders.id, buyerExisting[0].id));
    } else {
      await tx.insert(shareholders).values({
        companyId: l.companyId,
        name: rq.buyerName,
        percentage: String(round2(reqParts)),
        shareType: 'ordinaire',
      });
    }

    const remaining = round2(Number(l.parts) - reqParts);
    await tx
      .update(shareListings)
      .set({ parts: String(remaining), status: remaining <= 0 ? 'closed' : 'open' })
      .where(eq(shareListings.id, l.id));
    await tx.update(shareRequests).set({ status: 'accepted' }).where(eq(shareRequests.id, rid));
    return { ok: true as const, companyId: l.companyId, buyerUserId: rq.buyerUserId, accepted: true };
  });
}

meShareListingsRouter.post(
  '/requests/:rid/accept',
  asyncHandler(async (req, res) => {
    const r = await decideRequest(req, true);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    emitInvalidate([`company:${r.companyId}`, 'irs'], [['share-listings'], ['shareholders', r.companyId]]);
    if (r.buyerUserId) {
      await notify([r.buyerUserId], { type: 'share_request', title: 'Achat de parts accepté', body: 'Le transfert a été validé.', link: '/bourse' });
    }
    res.json({ ok: true });
  }),
);

meShareListingsRouter.post(
  '/requests/:rid/refuse',
  asyncHandler(async (req, res) => {
    const r = await decideRequest(req, false);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    emitInvalidate([`company:${r.companyId}`, 'irs'], [['share-listings']]);
    if (r.buyerUserId) {
      await notify([r.buyerUserId], { type: 'share_request', title: 'Demande d’achat refusée', body: null, link: '/bourse' });
    }
    res.json({ ok: true });
  }),
);

export const irsShareListingsRouter = Router();
irsShareListingsRouter.use(requireAuth, requireAppRole('irs'));

irsShareListingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({ l: shareListings, companyName: companies.name, sellerName: shareholders.name })
      .from(shareListings)
      .innerJoin(companies, eq(shareListings.companyId, companies.id))
      .leftJoin(shareholders, eq(shareListings.sellerShareholderId, shareholders.id))
      .orderBy(desc(shareListings.createdAt));
    const counts = await db
      .select({ listingId: shareRequests.listingId, n: sql<number>`COUNT(*)` })
      .from(shareRequests)
      .groupBy(shareRequests.listingId);
    const countMap = new Map(counts.map((c) => [c.listingId, Number(c.n)]));
    res.json({
      listings: rows.map((r) => ({
        id: r.l.id,
        companyName: r.companyName,
        sellerName: r.sellerName,
        parts: Number(r.l.parts),
        pricePerPart: Number(r.l.pricePerPart),
        status: r.l.status,
        requestCount: countMap.get(r.l.id) ?? 0,
        createdAt: r.l.createdAt,
      })),
    });
  }),
);
