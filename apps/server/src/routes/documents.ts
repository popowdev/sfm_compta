import { Router, type Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db';
import { companyDocuments, irsDocuments, users } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { documentUpload, documentFileUrl } from '../services/upload';
import { env } from '../env';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

const DOC_DIR = path.join(env.UPLOAD_DIR, 'documents');

async function cleanupReqFile(req: Request): Promise<void> {
  if (req.file) await unlink(req.file.path).catch(() => {});
}

// Best-effort: remove the file from disk for a stored /uploads/documents/<name> url,
// guarding against path traversal (only the basename inside DOC_DIR is unlinked).
async function unlinkStored(url: string): Promise<void> {
  const base = path.basename(url);
  if (!base || base === '.' || base === '..') return;
  await unlink(path.join(DOC_DIR, base)).catch(() => {});
}

function docName(req: Request): string {
  const raw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const fallback = req.file?.originalname ?? 'document';
  return (raw || fallback).slice(0, 200);
}

// ---------- Company documents ----------

export const meDocumentsRouter = Router({ mergeParams: true });
meDocumentsRouter.use(requireAuth);

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'documents');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) {
    return { ok: false as const, status: 403, error: 'forbidden' };
  }
  return { ok: true as const, canWrite: acc.canWrite };
}

meDocumentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({
        id: companyDocuments.id,
        name: companyDocuments.name,
        url: companyDocuments.url,
        mimeType: companyDocuments.mimeType,
        size: companyDocuments.size,
        uploadedByName: users.displayName,
        createdAt: companyDocuments.createdAt,
      })
      .from(companyDocuments)
      .leftJoin(users, eq(companyDocuments.uploadedByUserId, users.id))
      .where(eq(companyDocuments.companyId, companyId))
      .orderBy(desc(companyDocuments.createdAt));
    res.json({ canWrite: g.canWrite, documents: rows });
  }),
);

meDocumentsRouter.post(
  '/',
  documentUpload.single('file'),
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) {
      await cleanupReqFile(req);
      return res.status(400).json({ error: 'bad_request' });
    }
    const g = await gate(req, companyId);
    if (!g.ok) {
      await cleanupReqFile(req);
      return res.status(g.status).json({ error: g.error });
    }
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    await db.insert(companyDocuments).values({
      companyId,
      name: docName(req),
      url: documentFileUrl(req.file.filename),
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meDocumentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const existing = await db
      .select({ url: companyDocuments.url })
      .from(companyDocuments)
      .where(and(eq(companyDocuments.id, id), eq(companyDocuments.companyId, companyId)))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db
      .delete(companyDocuments)
      .where(and(eq(companyDocuments.id, id), eq(companyDocuments.companyId, companyId)));
    await unlinkStored(existing[0].url);
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.json({ ok: true });
  }),
);

// ---------- IRS documents ----------

export const irsDocumentsRouter = Router();
irsDocumentsRouter.use(requireAuth, requireAppRole('irs'));

irsDocumentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: irsDocuments.id,
        name: irsDocuments.name,
        url: irsDocuments.url,
        mimeType: irsDocuments.mimeType,
        size: irsDocuments.size,
        uploadedByName: users.displayName,
        createdAt: irsDocuments.createdAt,
      })
      .from(irsDocuments)
      .leftJoin(users, eq(irsDocuments.uploadedByUserId, users.id))
      .orderBy(desc(irsDocuments.createdAt));
    res.json({ documents: rows });
  }),
);

irsDocumentsRouter.post(
  '/',
  documentUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    await db.insert(irsDocuments).values({
      name: docName(req),
      url: documentFileUrl(req.file.filename),
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedByUserId: req.user!.id,
    });
    emitInvalidate(['irs'], [['irs-documents']]);
    res.status(201).json({ ok: true });
  }),
);

irsDocumentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ url: irsDocuments.url })
      .from(irsDocuments)
      .where(eq(irsDocuments.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(irsDocuments).where(eq(irsDocuments.id, id));
    await unlinkStored(existing[0].url);
    emitInvalidate(['irs'], [['irs-documents']]);
    res.json({ ok: true });
  }),
);
