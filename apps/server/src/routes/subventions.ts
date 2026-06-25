import { Router, type Request } from 'express';
import { z } from 'zod';
import { desc, eq, inArray } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { SUBVENTION_TYPE_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { subventions, subventionDocuments, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';
import { subventionUpload, subventionFileUrl } from '../services/upload';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface DocRow {
  id: number;
  url: string;
  name: string;
}

function serialize(s: typeof subventions.$inferSelect, docs: DocRow[]) {
  return {
    id: s.id,
    companyId: s.companyId,
    motif: s.motif,
    type: s.type,
    requesterName: s.requesterName,
    amountRequested: Number(s.amountRequested),
    amountGranted: s.amountGranted === null ? null : Number(s.amountGranted),
    status: s.status,
    photoUrl: s.photoUrl,
    documents: docs,
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
    res.json({ canWrite: acc.canWrite, subventions: rows.map((r) => serialize(r, docs.get(r.id) ?? [])) });
  }),
);

const requestSchema = z.object({
  motif: z.string().trim().min(1).max(200),
  type: z.enum(SUBVENTION_TYPE_KEYS as [string, ...string[]]),
  requesterName: z.string().trim().min(1).max(120),
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
    res.json(rows.map((r) => ({ ...serialize(r.sub, docs.get(r.sub.id) ?? []), companyName: r.companyName })));
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
      .select({ companyId: subventions.companyId })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    const { status, amountGranted } = parsed.data;
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
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-subventions'],
      ['subventions', existing[0].companyId],
    ]);
    res.json({ ok: true });
  }),
);

irsSubventionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ companyId: subventions.companyId })
      .from(subventions)
      .where(eq(subventions.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(subventions).where(eq(subventions.id, id));
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-subventions'],
      ['subventions', existing[0].companyId],
    ]);
    res.json({ ok: true });
  }),
);
