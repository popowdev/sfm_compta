import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { companies, companyNotes, users } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function companyExists(id: number): Promise<boolean> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1);
  return !!rows[0];
}

const DT_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
function normalizeDt(s: string): string {
  let v = s.replace('T', ' ');
  if (v.length === 16) v += ':00';
  return v;
}

function serialize(n: typeof companyNotes.$inferSelect) {
  return {
    id: n.id,
    companyId: n.companyId,
    authorName: n.authorName,
    type: n.type,
    incidentAt: n.incidentAt,
    body: n.body,
    createdAt: n.createdAt,
  };
}

export const irsCompanyNotesRouter = Router({ mergeParams: true });
irsCompanyNotesRouter.use(requireAuth, requireAppRole('irs'));

irsCompanyNotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const rows = await db
      .select()
      .from(companyNotes)
      .where(eq(companyNotes.companyId, companyId))
      .orderBy(desc(companyNotes.incidentAt), desc(companyNotes.id));
    res.json({ notes: rows.map(serialize) });
  }),
);

const createSchema = z.object({
  type: z.enum(['no_answer', 'not_present', 'other']),
  incidentAt: z.string().regex(DT_RE),
  body: z.string().trim().max(2000).optional(),
});

irsCompanyNotesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    if (!(await companyExists(companyId))) return res.status(404).json({ error: 'not_found' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const author = await db
      .select({ name: users.displayName })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);
    await db.insert(companyNotes).values({
      companyId,
      authorUserId: req.user!.id,
      authorName: author[0]?.name ?? '',
      type: parsed.data.type,
      incidentAt: normalizeDt(parsed.data.incidentAt),
      body: parsed.data.body && parsed.data.body.length ? parsed.data.body : null,
    });
    res.status(201).json({ ok: true });
  }),
);

irsCompanyNotesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const rows = await db
      .select({ id: companyNotes.id })
      .from(companyNotes)
      .where(and(eq(companyNotes.id, id), eq(companyNotes.companyId, companyId)))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    await db.delete(companyNotes).where(eq(companyNotes.id, id));
    res.json({ ok: true });
  }),
);
