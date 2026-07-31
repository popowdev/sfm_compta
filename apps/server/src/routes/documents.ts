import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db';
import { companyDocuments, companyDocFolders, irsDocuments, users } from '../db/schema';
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
const DOC_QUOTA_COUNT = 300;
const DOC_QUOTA_BYTES = 500 * 1024 * 1024;

async function docQuotaExceeded(companyId: number, incomingSize: number): Promise<boolean> {
  const usage = await db
    .select({ n: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${companyDocuments.size}), 0)` })
    .from(companyDocuments)
    .where(eq(companyDocuments.companyId, companyId));
  return (
    Number(usage[0]?.n ?? 0) >= DOC_QUOTA_COUNT ||
    Number(usage[0]?.total ?? 0) + incomingSize > DOC_QUOTA_BYTES
  );
}

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
function docFolder(req: Request): string | null {
  const raw = typeof req.body?.folder === 'string' ? req.body.folder.trim() : '';
  return raw ? raw.slice(0, 60) : null;
}

async function ensureFolder(companyId: number, name: string | null): Promise<void> {
  if (!name) return;
  await db.insert(companyDocFolders).values({ companyId, name }).onDuplicateKeyUpdate({ set: { name } });
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
        folder: companyDocuments.folder,
        uploadedByName: users.displayName,
        createdAt: companyDocuments.createdAt,
      })
      .from(companyDocuments)
      .leftJoin(users, eq(companyDocuments.uploadedByUserId, users.id))
      .where(eq(companyDocuments.companyId, companyId))
      .orderBy(desc(companyDocuments.createdAt));
    const folderRows = await db
      .select({ name: companyDocFolders.name })
      .from(companyDocFolders)
      .where(eq(companyDocFolders.companyId, companyId));
    const counts = new Map<string, number>();
    for (const r of rows) if (r.folder) counts.set(r.folder, (counts.get(r.folder) ?? 0) + 1);
    const names = new Set<string>(folderRows.map((f) => f.name));
    for (const n of counts.keys()) names.add(n);
    const folders = [...names]
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((name) => ({ name, count: counts.get(name) ?? 0 }));
    res.json({
      canWrite: g.canWrite,
      folders,
      documents: rows.map((r) => ({ ...r, url: `/api/me/companies/${companyId}/documents/${r.id}/download` })),
    });
  }),
);

meDocumentsRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const row = await db
      .select({ url: companyDocuments.url })
      .from(companyDocuments)
      .where(and(eq(companyDocuments.id, id), eq(companyDocuments.companyId, companyId)))
      .limit(1);
    if (!row[0]) return res.status(404).json({ error: 'not_found' });
    const base = path.basename(row[0].url);
    if (!base || base.includes('..')) return res.status(404).json({ error: 'not_found' });
    res.sendFile(path.join(DOC_DIR, base));
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
    if (await docQuotaExceeded(companyId, req.file.size)) {
      await cleanupReqFile(req);
      return res.status(400).json({ error: 'quota_exceeded' });
    }
    const folder = docFolder(req);
    await ensureFolder(companyId, folder);
    await db.insert(companyDocuments).values({
      companyId,
      name: docName(req),
      url: documentFileUrl(req.file.filename),
      mimeType: req.file.mimetype,
      size: req.file.size,
      folder,
      uploadedByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

const folderNameSchema = z.object({ name: z.string().trim().min(1).max(60) });
const folderRenameSchema = z.object({ from: z.string().trim().min(1).max(60), to: z.string().trim().min(1).max(60) });
const moveSchema = z.object({ folder: z.union([z.string().trim().max(60), z.null()]) });

meDocumentsRouter.post(
  '/folders',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = folderNameSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    await ensureFolder(companyId, p.data.name);
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meDocumentsRouter.patch(
  '/folders',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = folderRenameSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    if (p.data.from === p.data.to) return res.json({ ok: true });
    await db.delete(companyDocFolders).where(and(eq(companyDocFolders.companyId, companyId), eq(companyDocFolders.name, p.data.from)));
    await ensureFolder(companyId, p.data.to);
    await db.update(companyDocuments).set({ folder: p.data.to }).where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.folder, p.data.from)));
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.json({ ok: true });
  }),
);

meDocumentsRouter.delete(
  '/folders/:name',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const name = String(req.params.name ?? '').slice(0, 60);
    if (!name) return res.status(400).json({ error: 'bad_request' });
    await db.update(companyDocuments).set({ folder: null }).where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.folder, name)));
    await db.delete(companyDocFolders).where(and(eq(companyDocFolders.companyId, companyId), eq(companyDocFolders.name, name)));
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.json({ ok: true });
  }),
);

meDocumentsRouter.patch(
  '/:id/folder',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });
    const p = moveSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    const folder = p.data.folder ? p.data.folder.slice(0, 60) : null;
    await ensureFolder(companyId, folder);
    const upd = await db.update(companyDocuments).set({ folder }).where(and(eq(companyDocuments.id, id), eq(companyDocuments.companyId, companyId)));
    if (!upd[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['company-documents', companyId]]);
    res.json({ ok: true });
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
        folder: irsDocuments.folder,
        uploadedByName: users.displayName,
        createdAt: irsDocuments.createdAt,
      })
      .from(irsDocuments)
      .leftJoin(users, eq(irsDocuments.uploadedByUserId, users.id))
      .orderBy(desc(irsDocuments.createdAt));
    res.json({ documents: rows.map((r) => ({ ...r, url: `/api/irs/documents/${r.id}/download` })) });
  }),
);

irsDocumentsRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const row = await db
      .select({ url: irsDocuments.url })
      .from(irsDocuments)
      .where(eq(irsDocuments.id, id))
      .limit(1);
    if (!row[0]) return res.status(404).json({ error: 'not_found' });
    const base = path.basename(row[0].url);
    if (!base || base.includes('..')) return res.status(404).json({ error: 'not_found' });
    res.sendFile(path.join(DOC_DIR, base));
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
      folder: docFolder(req),
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
