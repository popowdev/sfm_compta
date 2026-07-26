import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  ASSOCIATION_MEMBER_ROLE_KEYS,
  ASSOCIATION_PARTY_TYPE_KEYS,
} from '@rp-compta/shared';
import { db } from '../db';
import {
  associations,
  associationMembers,
  associationTransactions,
  associationDocuments,
  users,
} from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { isStaff } from '../services/access';
import { getAssociationAccess, slugifyAssociation, uniqueAssociationSlug } from '../services/associations';
import { companyLogoUpload, companyLogoUrl, documentUpload, documentFileUrl } from '../services/upload';
import { env } from '../env';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function isDuplicate(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_DUP_ENTRY';
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = z.number().finite().min(0).max(999_999_999.99);
const DOC_DIR = path.join(env.UPLOAD_DIR, 'documents');

async function cleanupReqFile(req: Request): Promise<void> {
  if (req.file) await unlink(req.file.path).catch(() => {});
}
async function unlinkStored(url: string): Promise<void> {
  const base = path.basename(url);
  if (!base || base === '.' || base === '..') return;
  await unlink(path.join(DOC_DIR, base)).catch(() => {});
}

async function balanceMap(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!ids.length) return map;
  const rows = await db
    .select({ id: associationTransactions.associationId, total: sql<string>`COALESCE(SUM(${associationTransactions.amount}), 0)` })
    .from(associationTransactions)
    .where(inArray(associationTransactions.associationId, ids))
    .groupBy(associationTransactions.associationId);
  for (const r of rows) map.set(r.id, Number(r.total));
  return map;
}
async function memberCountMap(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!ids.length) return map;
  const rows = await db
    .select({ id: associationMembers.associationId, n: sql<number>`COUNT(*)` })
    .from(associationMembers)
    .where(and(inArray(associationMembers.associationId, ids), eq(associationMembers.active, true)))
    .groupBy(associationMembers.associationId);
  for (const r of rows) map.set(r.id, Number(r.n));
  return map;
}

async function resolveUser(discordId: string, displayName: string): Promise<number> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discordId)).limit(1);
  if (existing[0]) return existing[0].id;
  try {
    const inserted = await db.insert(users).values({ discordId, displayName });
    return Number(inserted[0].insertId);
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const again = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discordId)).limit(1);
    if (!again[0]) throw err;
    return again[0].id;
  }
}

function serializeAssociation(a: typeof associations.$inferSelect) {
  return {
    id: a.id,
    name: a.name,
    slug: a.slug,
    objet: a.objet,
    logoUrl: a.logoUrl,
    status: a.status,
    createdAt: a.createdAt,
  };
}

// ---------------- IRS registry ----------------

export const irsAssociationsRouter = Router();
irsAssociationsRouter.use(requireAuth, requireAppRole('irs'));

irsAssociationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(associations).orderBy(desc(associations.createdAt));
    const ids = rows.map((r) => r.id);
    const [bal, cnt] = await Promise.all([balanceMap(ids), memberCountMap(ids)]);
    res.json(
      rows.map((a) => ({
        ...serializeAssociation(a),
        balance: bal.get(a.id) ?? 0,
        memberCount: cnt.get(a.id) ?? 0,
      })),
    );
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  objet: z.string().trim().max(250).optional(),
});

irsAssociationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const slug = await uniqueAssociationSlug(slugifyAssociation(parsed.data.name));
    const inserted = await db
      .insert(associations)
      .values({ name: parsed.data.name, slug, objet: parsed.data.objet ?? null });
    emitInvalidate(['irs'], [['irs-associations'], ['my-associations']]);
    res.status(201).json({ ok: true, id: Number(inserted[0].insertId), slug });
  }),
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  objet: z.string().trim().max(250).nullish(),
  status: z.enum(['active', 'dissolved']).optional(),
});

irsAssociationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const updates: Partial<typeof associations.$inferInsert> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.objet !== undefined) updates.objet = parsed.data.objet || null;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (Object.keys(updates).length === 0) return res.json({ ok: true });
    const result = await db.update(associations).set(updates).where(eq(associations.id, id));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `assoc:${id}`], [['irs-associations'], ['my-associations'], ['association']]);
    res.json({ ok: true });
  }),
);

irsAssociationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const result = await db.delete(associations).where(eq(associations.id, id));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `assoc:${id}`], [['irs-associations'], ['my-associations']]);
    res.json({ ok: true });
  }),
);

// ---------------- Member-facing space ----------------

export const meAssociationsRouter = Router({ mergeParams: true });
meAssociationsRouter.use(requireAuth);

meAssociationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const staff = await isStaff(req.user!.id);
    let rows: { a: typeof associations.$inferSelect; role: string | null }[];
    if (staff) {
      const all = await db.select().from(associations).orderBy(desc(associations.createdAt));
      rows = all.map((a) => ({ a, role: null }));
    } else {
      const joined = await db
        .select({ a: associations, role: associationMembers.role })
        .from(associationMembers)
        .innerJoin(associations, eq(associationMembers.associationId, associations.id))
        .where(and(eq(associationMembers.userId, req.user!.id), eq(associationMembers.active, true)))
        .orderBy(desc(associations.createdAt));
      rows = joined;
    }
    const ids = rows.map((r) => r.a.id);
    const [bal, cnt] = await Promise.all([balanceMap(ids), memberCountMap(ids)]);
    res.json(
      rows.map((r) => ({
        ...serializeAssociation(r.a),
        role: r.role,
        isStaff: staff,
        balance: bal.get(r.a.id) ?? 0,
        memberCount: cnt.get(r.a.id) ?? 0,
      })),
    );
  }),
);

async function loadBySlug(slug: string) {
  const rows = await db.select().from(associations).where(eq(associations.slug, slug)).limit(1);
  return rows[0] ?? null;
}

meAssociationsRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const a = await loadBySlug(req.params.slug ?? '');
    if (!a) return res.status(404).json({ error: 'not_found' });
    const acc = await getAssociationAccess(req.user!.id, a.id);
    if (!acc) return res.status(403).json({ error: 'forbidden' });
    const [bal, cnt] = await Promise.all([balanceMap([a.id]), memberCountMap([a.id])]);
    const recent = await db
      .select()
      .from(associationTransactions)
      .where(eq(associationTransactions.associationId, a.id))
      .orderBy(desc(associationTransactions.createdAt))
      .limit(5);
    res.json({
      association: serializeAssociation(a),
      access: acc,
      balance: bal.get(a.id) ?? 0,
      memberCount: cnt.get(a.id) ?? 0,
      recent: recent.map((t) => ({
        id: t.id,
        direction: t.direction,
        partyType: t.partyType,
        fromName: t.fromName,
        toName: t.toName,
        label: t.label,
        amount: Number(t.amount),
        createdAt: t.createdAt,
      })),
    });
  }),
);

async function gate(req: Request, id: number) {
  const acc = await getAssociationAccess(req.user!.id, id);
  if (!acc) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, acc };
}

// ----- members -----

meAssociationsRouter.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: associationMembers.id,
        userId: associationMembers.userId,
        role: associationMembers.role,
        active: associationMembers.active,
        name: users.displayName,
        discordId: users.discordId,
        createdAt: associationMembers.createdAt,
      })
      .from(associationMembers)
      .innerJoin(users, eq(associationMembers.userId, users.id))
      .where(eq(associationMembers.associationId, id))
      .orderBy(associationMembers.role);
    res.json({ canManage: g.acc.canManageMembers, members: rows });
  }),
);

const memberSchema = z.object({
  discordId: z.string().trim().regex(/^\d{5,32}$/),
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ASSOCIATION_MEMBER_ROLE_KEYS as [string, ...string[]]),
});

meAssociationsRouter.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.acc.canManageMembers) return res.status(403).json({ error: 'forbidden' });
    const parsed = memberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const userId = await resolveUser(parsed.data.discordId, parsed.data.displayName ?? parsed.data.discordId);
    try {
      await db
        .insert(associationMembers)
        .values({ associationId: id, userId, role: parsed.data.role as 'membre' })
        .onDuplicateKeyUpdate({ set: { role: parsed.data.role as 'membre', active: true } });
    } catch (err) {
      if (isDuplicate(err)) return res.status(409).json({ error: 'duplicate' });
      throw err;
    }
    emitInvalidate(['irs', `assoc:${id}`], [['association-members', id], ['association'], ['my-associations']]);
    res.status(201).json({ ok: true });
  }),
);

meAssociationsRouter.patch(
  '/:id/members/:mid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const mid = parseId(req.params.mid);
    if (!id || !mid) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.acc.canManageMembers) return res.status(403).json({ error: 'forbidden' });
    const parsed = z.object({ role: z.enum(ASSOCIATION_MEMBER_ROLE_KEYS as [string, ...string[]]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await db
      .update(associationMembers)
      .set({ role: parsed.data.role as 'membre' })
      .where(and(eq(associationMembers.id, mid), eq(associationMembers.associationId, id)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `assoc:${id}`], [['association-members', id], ['association']]);
    res.json({ ok: true });
  }),
);

meAssociationsRouter.delete(
  '/:id/members/:mid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const mid = parseId(req.params.mid);
    if (!id || !mid) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.acc.canManageMembers) return res.status(403).json({ error: 'forbidden' });
    const result = await db
      .delete(associationMembers)
      .where(and(eq(associationMembers.id, mid), eq(associationMembers.associationId, id)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `assoc:${id}`], [['association-members', id], ['association'], ['my-associations']]);
    res.json({ ok: true });
  }),
);

// ----- transactions -----

meAssociationsRouter.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: associationTransactions.id,
        direction: associationTransactions.direction,
        partyType: associationTransactions.partyType,
        fromName: associationTransactions.fromName,
        toName: associationTransactions.toName,
        label: associationTransactions.label,
        amount: associationTransactions.amount,
        createdByName: users.displayName,
        createdAt: associationTransactions.createdAt,
      })
      .from(associationTransactions)
      .leftJoin(users, eq(associationTransactions.createdByUserId, users.id))
      .where(eq(associationTransactions.associationId, id))
      .orderBy(desc(associationTransactions.createdAt))
      .limit(500);
    const bal = await balanceMap([id]);
    res.json({
      canManage: g.acc.canManageTreasury,
      balance: bal.get(id) ?? 0,
      transactions: rows.map((t) => ({
        id: t.id,
        direction: t.direction,
        partyType: t.partyType,
        fromName: t.fromName,
        toName: t.toName,
        label: t.label,
        amount: Number(t.amount),
        createdByName: t.createdByName,
        createdAt: t.createdAt,
      })),
    });
  }),
);

const txSchema = z
  .object({
    direction: z.enum(['in', 'out']),
    partyType: z.enum(ASSOCIATION_PARTY_TYPE_KEYS as [string, ...string[]]),
    fromName: z.string().trim().max(140).optional().default(''),
    toName: z.string().trim().max(140).optional().default(''),
    label: z.string().trim().min(1).max(200),
    amount: money.refine((n) => n > 0, 'montant requis'),
  })
  .refine((d) => (d.direction === 'in' ? d.fromName.length > 0 : d.toName.length > 0), {
    message: 'contrepartie requise',
  });

meAssociationsRouter.post(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.acc.canManageTreasury) return res.status(403).json({ error: 'forbidden' });
    const parsed = txSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const signed = parsed.data.direction === 'out' ? -round2(parsed.data.amount) : round2(parsed.data.amount);
    await db.insert(associationTransactions).values({
      associationId: id,
      direction: parsed.data.direction,
      partyType: parsed.data.partyType as 'entreprise',
      fromName: parsed.data.fromName || null,
      toName: parsed.data.toName || null,
      label: parsed.data.label,
      amount: String(signed),
      createdByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `assoc:${id}`], [['association-transactions', id], ['association'], ['my-associations']]);
    res.status(201).json({ ok: true });
  }),
);

meAssociationsRouter.delete(
  '/:id/transactions/:tid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const tid = parseId(req.params.tid);
    if (!id || !tid) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.acc.canManageTreasury) return res.status(403).json({ error: 'forbidden' });
    const result = await db
      .delete(associationTransactions)
      .where(and(eq(associationTransactions.id, tid), eq(associationTransactions.associationId, id)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `assoc:${id}`], [['association-transactions', id], ['association'], ['my-associations']]);
    res.json({ ok: true });
  }),
);

// ----- documents -----

function canWriteDocs(acc: { isStaff: boolean; role: string | null }): boolean {
  return acc.isStaff || acc.role === 'president' || acc.role === 'tresorier' || acc.role === 'secretaire';
}

meAssociationsRouter.get(
  '/:id/documents',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: associationDocuments.id,
        name: associationDocuments.name,
        url: associationDocuments.url,
        mimeType: associationDocuments.mimeType,
        size: associationDocuments.size,
        folder: associationDocuments.folder,
        uploadedByName: users.displayName,
        createdAt: associationDocuments.createdAt,
      })
      .from(associationDocuments)
      .leftJoin(users, eq(associationDocuments.uploadedByUserId, users.id))
      .where(eq(associationDocuments.associationId, id))
      .orderBy(desc(associationDocuments.createdAt));
    res.json({ canWrite: canWriteDocs(g.acc), documents: rows });
  }),
);

meAssociationsRouter.post(
  '/:id/documents',
  documentUpload.single('file'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      await cleanupReqFile(req);
      return res.status(400).json({ error: 'bad_request' });
    }
    const g = await gate(req, id);
    if (!g.ok || !canWriteDocs(g.acc)) {
      await cleanupReqFile(req);
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const raw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const rawFolder = typeof req.body?.folder === 'string' ? req.body.folder.trim() : '';
    await db.insert(associationDocuments).values({
      associationId: id,
      name: (raw || req.file.originalname || 'document').slice(0, 200),
      url: documentFileUrl(req.file.filename),
      mimeType: req.file.mimetype,
      size: req.file.size,
      folder: rawFolder ? rawFolder.slice(0, 60) : null,
      uploadedByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `assoc:${id}`], [['association-documents', id]]);
    res.status(201).json({ ok: true });
  }),
);

meAssociationsRouter.delete(
  '/:id/documents/:did',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const did = parseId(req.params.did);
    if (!id || !did) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok || !canWriteDocs(g.acc)) return res.status(403).json({ error: 'forbidden' });
    const existing = await db
      .select({ url: associationDocuments.url })
      .from(associationDocuments)
      .where(and(eq(associationDocuments.id, did), eq(associationDocuments.associationId, id)))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db
      .delete(associationDocuments)
      .where(and(eq(associationDocuments.id, did), eq(associationDocuments.associationId, id)));
    await unlinkStored(existing[0].url);
    emitInvalidate(['irs', `assoc:${id}`], [['association-documents', id]]);
    res.json({ ok: true });
  }),
);

// ----- logo (président or staff) -----

meAssociationsRouter.post(
  '/:id/logo',
  companyLogoUpload.single('logo'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      await cleanupReqFile(req);
      return res.status(400).json({ error: 'bad_request' });
    }
    const g = await gate(req, id);
    if (!g.ok || !g.acc.canManageSettings) {
      await cleanupReqFile(req);
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!req.file) return res.status(400).json({ error: 'invalid_file' });
    await db.update(associations).set({ logoUrl: companyLogoUrl(req.file.filename) }).where(eq(associations.id, id));
    emitInvalidate(['irs', `assoc:${id}`], [['association'], ['my-associations'], ['irs-associations']]);
    res.json({ ok: true });
  }),
);

const objetSchema = z.object({ objet: z.string().trim().max(250).nullish() });
meAssociationsRouter.patch(
  '/:id/objet',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, id);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.acc.canManageSettings) return res.status(403).json({ error: 'forbidden' });
    const parsed = objetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.update(associations).set({ objet: parsed.data.objet || null }).where(eq(associations.id, id));
    emitInvalidate(['irs', `assoc:${id}`], [['association'], ['my-associations']]);
    res.json({ ok: true });
  }),
);
