import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { SUBVENTION_TYPE_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { subventions, subventionDocuments, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { notify, companyManagerUserIds } from '../services/notifications';
import { recordAudit } from '../services/audit';
import { emitInvalidate } from '../realtime/socket';
import { subventionUpload, subventionFileUrl } from '../services/upload';
import { env } from '../env';

const SUB_DIR = path.join(env.UPLOAD_DIR, 'subventions');

function serveSubFile(res: import('express').Response, storedUrl: string): void {
  const base = path.basename(storedUrl);
  if (!base || base.includes('..')) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.sendFile(path.join(SUB_DIR, base));
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface DocRow {
  id: number;
  url: string;
  name: string;
}

function serialize(s: typeof subventions.$inferSelect, docs: DocRow[], fileBase: string) {
  return {
    id: s.id,
    companyId: s.companyId,
    motif: s.motif,
    type: s.type,
    requesterName: s.requesterName,
    rib: s.rib,
    amountRequested: Number(s.amountRequested),
    amountGranted: s.amountGranted === null ? null : Number(s.amountGranted),
    status: s.status,
    photoUrl: s.photoUrl ? `${fileBase}/${s.id}/photo` : null,
    documents: docs.map((d) => ({ id: d.id, name: d.name, url: `${fileBase}/${s.id}/documents/${d.id}` })),
    notes: s.notes,
    decidedAt: s.decidedAt,
    createdAt: s.createdAt,
  };
}

async function docsBySubvention(ids: number[]): Promise<Map<number, DocRow[]>> {
  const map = new Map<number, DocRow[]>();
  if (!ids.length) return map;
  const rows = await db
    .select()
    .from(subventionDocuments)
    .where(inArray(subventionDocuments.subventionId, ids));
  for (const r of rows) {
    const arr = map.get(r.subventionId) ?? [];
    arr.push({ id: r.id, url: r.url, name: r.name });
    map.set(r.subventionId, arr);
  }
  return map;
}

function uploadedFiles(req: Request): Express.Multer.File[] {
  const f = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!f) return [];
  return [...(f.photo ?? []), ...(f.documents ?? [])];
}
async function cleanupFiles(req: Request): Promise<void> {
  await Promise.all(uploadedFiles(req).map((f) => unlink(f.path).catch(() => {})));
}

const amount = z.number().nonnegative().finite().max(999_999_999_999.99);

export const meSubventionsRouter = Router({ mergeParams: true });
meSubventionsRouter.use(requireAuth);

meSubventionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'subventions');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });
    const rows = await db
      .select()
      .from(subventions)
      .where(eq(subventions.companyId, companyId))
      .orderBy(desc(subventions.createdAt));
    const docs = await docsBySubvention(rows.map((r) => r.id));
    const fileBase = `/api/me/companies/${companyId}/subventions`;
    res.json({
      canWrite: acc.canWrite,
      subventions: rows.map((r) => serialize(r, docs.get(r.id) ?? [], fileBase)),
    });
  }),
);

async function meSubventionGate(req: Request, companyId: number): Promise<boolean> {
  const acc = await getModuleAccess(req.user!.id, companyId, 'subventions');
  return !!acc && acc.enabled && !acc.blocked && acc.canView;
}

meSubventionsRouter.get(
  '/:id/photo',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    if (!(await meSubventionGate(req, companyId))) return res.status(403).json({ error: 'forbidden' });
    const row = await db
      .select({ photoUrl: subventions.photoUrl })
      .from(subventions)
      .where(and(eq(subventions.id, id), eq(subventions.companyId, companyId)))
      .limit(1);
    if (!row[0]?.photoUrl) return res.status(404).json({ error: 'not_found' });
    serveSubFile(res, row[0].photoUrl);
  }),
);

meSubventionsRouter.get(
  '/:id/documents/:docId',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    const docId = parseId(req.params.docId);
    if (!companyId || !id || !docId) return res.status(400).json({ error: 'bad_request' });
    if (!(await meSubventionGate(req, companyId))) return res.status(403).json({ error: 'forbidden' });
    const row = await db
      .select({ url: subventionDocuments.url })
      .from(subventionDocuments)
      .innerJoin(subventions, eq(subventionDocuments.subventionId, subventions.id))
      .where(
        and(
          eq(subventionDocuments.id, docId),
          eq(subventionDocuments.subventionId, id),
          eq(subventions.companyId, companyId),
        ),
      )
      .limit(1);
    if (!row[0]) return res.status(404).json({ error: 'not_found' });
    serveSubFile(res, row[0].url);
  }),
);

const requestSchema = z.object({
  motif: z.string().trim().min(1).max(200),
  type: z.enum(SUBVENTION_TYPE_KEYS as [string, ...string[]]),
  requesterName: z.string().trim().min(1).max(120),
  rib: z.string().trim().min(1).max(64),
  amountRequested: z.coerce.number().pipe(amount),
  notes: z.string().max(2000).optional(),
});

meSubventionsRouter.post(
  '/',
  subventionUpload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'documents', maxCount: 10 },
  ]),
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) {
      await cleanupFiles(req);
      return res.status(400).json({ error: 'bad_request' });
    }
    const acc = await getModuleAccess(req.user!.id, companyId, 'subventions');
    if (!acc || !acc.enabled || acc.blocked || !acc.canCreate) {
      await cleanupFiles(req);
      return res.status(acc ? 403 : 404).json({ error: acc ? 'forbidden' : 'not_member' });
    }
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      await cleanupFiles(req);
      return res.status(400).json({ error: 'bad_request' });
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const photo = files?.photo?.[0];
    if (!photo || !photo.mimetype.startsWith('image/')) {
      await cleanupFiles(req);
      return res.status(400).json({ error: 'photo_required' });
    }
    const d = parsed.data;
    const documents = files?.documents ?? [];
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(subventions).values({
        companyId,
        motif: d.motif,
        type: d.type as (typeof subventions.$inferInsert)['type'],
        requesterName: d.requesterName,
        rib: d.rib,
        amountRequested: String(d.amountRequested),
        photoUrl: subventionFileUrl(photo.filename),
        notes: d.notes ?? null,
        requestedByUserId: req.user!.id,
      });
      const subventionId = Number(inserted[0].insertId);
      if (documents.length) {
        await tx.insert(subventionDocuments).values(
          documents.map((f) => ({
            subventionId,
            url: subventionFileUrl(f.filename),
            name: f.originalname.slice(0, 200),
          })),
        );
      }
    });
    emitInvalidate(['irs', `company:${companyId}`], [
      ['subventions', companyId],
      ['irs-subventions'],
    ]);
    res.status(201).json({ ok: true });
  }),
);

export const irsSubventionsRouter = Router();
irsSubventionsRouter.use(requireAuth, requireAppRole('irs'));

irsSubventionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({ sub: subventions, companyName: companies.name })
      .from(subventions)
      .innerJoin(companies, eq(subventions.companyId, companies.id))
      .orderBy(desc(subventions.createdAt));
    const docs = await docsBySubvention(rows.map((r) => r.sub.id));
    res.json(
      rows.map((r) => ({
        ...serialize(r.sub, docs.get(r.sub.id) ?? [], '/api/subventions'),
        companyName: r.companyName,
      })),
    );
  }),
);

irsSubventionsRouter.get(
  '/:id/photo',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const row = await db
      .select({ photoUrl: subventions.photoUrl })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!row[0]?.photoUrl) return res.status(404).json({ error: 'not_found' });
    serveSubFile(res, row[0].photoUrl);
  }),
);

irsSubventionsRouter.get(
  '/:id/documents/:docId',
  asyncHandler(async (req, res) => {
    const docId = parseId(req.params.docId);
    if (!docId) return res.status(400).json({ error: 'bad_request' });
    const row = await db
      .select({ url: subventionDocuments.url })
      .from(subventionDocuments)
      .where(eq(subventionDocuments.id, docId))
      .limit(1);
    if (!row[0]) return res.status(404).json({ error: 'not_found' });
    serveSubFile(res, row[0].url);
  }),
);

const decisionSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'paid']),
  amountGranted: amount.nullable().optional(),
});

irsSubventionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({
        companyId: subventions.companyId,
        motif: subventions.motif,
        requestedByUserId: subventions.requestedByUserId,
        status: subventions.status,
        amountGranted: subventions.amountGranted,
      })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    const { status, amountGranted } = parsed.data;
    if (existing[0].status === 'paid' && status !== 'paid') {
      return res.status(409).json({ error: 'already_paid' });
    }
    const decided = status === 'approved' || status === 'paid' || status === 'rejected';
    const updates: Partial<typeof subventions.$inferInsert> = {
      status,
      decidedAt: decided ? new Date() : null,
    };
    if (status === 'approved' || status === 'paid') {
      if (amountGranted == null || amountGranted <= 0) {
        return res.status(400).json({ error: 'amount_required' });
      }
      updates.amountGranted = String(amountGranted);
    } else {
      updates.amountGranted = null;
    }
    await db.update(subventions).set(updates).where(eq(subventions.id, id));
    const companyId = existing[0].companyId;
    emitInvalidate(['irs', `company:${companyId}`], [['irs-subventions'], ['subventions', companyId]]);

    const statusLabel: Record<string, string> = {
      approved: 'accordée',
      paid: 'versée',
      rejected: 'refusée',
      pending: 'rouverte',
    };
    const recipients = new Set(await companyManagerUserIds(companyId));
    if (existing[0].requestedByUserId) recipients.add(existing[0].requestedByUserId);
    await notify([...recipients], {
      type: 'subvention',
      title: `Subvention ${statusLabel[status] ?? status}`,
      body: `« ${existing[0].motif} »${updates.amountGranted ? ` — ${updates.amountGranted} $` : ''}`,
      link: `/entreprise`,
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: `subvention_${status}`,
      targetType: 'subvention',
      targetLabel: existing[0].motif,
      detail: updates.amountGranted ? `${updates.amountGranted} $` : null,
    });
    res.json({ ok: true });
  }),
);

irsSubventionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ companyId: subventions.companyId, motif: subventions.motif })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(subventions).where(eq(subventions.id, id));
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-subventions'],
      ['subventions', existing[0].companyId],
    ]);
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'subvention_delete',
      targetType: 'subvention',
      targetLabel: existing[0].motif,
    });
    res.json({ ok: true });
  }),
);
