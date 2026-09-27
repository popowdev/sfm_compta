import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '../db';
import {
  declarations,
  companies,
  sales,
  companyExpenses,
  garageRepairs,
  garageCustoms,
  companyEmployees,
  timeEntries,
} from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { computeTaxes } from '../services/declarations';
import { computeWeeklyCharges } from '../services/weeklyCharges';
import { exerciceWeekFigures } from './exercices';
import { emitInvalidate } from '../realtime/socket';
import { recordAudit } from '../services/audit';
import { bizWeek } from '../services/bizTime';

const round2 = (n: number) => Math.round(n * 100) / 100;
const MAX_WEEKS_BACK = 8;

async function weekFigures(companyId: number, start: string, end: string) {
  const fromExercice = await exerciceWeekFigures(companyId, start, end);
  if (fromExercice) return { ...fromExercice, source: 'exercice' as const };
  const live = await computeWeeklyCharges(companyId, start, end);
  return { ...live, dividends: 0, source: 'live' as const };
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function num(v: string): number {
  return Number(v);
}

function serialize(d: typeof declarations.$inferSelect) {
  return {
    id: d.id,
    companyId: d.companyId,
    weekLabel: d.weekLabel,
    weekStart: d.weekStart,
    declarantName: d.declarantName,
    caNet: num(d.caNet),
    charges: num(d.charges),
    benefit: num(d.benefit),
    taxableBenefit: d.taxableBenefit == null ? null : num(d.taxableBenefit),
    corporateTax: num(d.corporateTax),
    dividends: num(d.dividends),
    dividendTax: num(d.dividendTax),
    totalTax: num(d.totalTax),
    status: d.status,
    email: d.email,
    notes: d.notes,
    createdAt: d.createdAt,
    paidAt: d.paidAt,
    archivedAt: d.archivedAt,
  };
}

export const meDeclarationsRouter = Router({ mergeParams: true });
meDeclarationsRouter.use(requireAuth);

meDeclarationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'declarations');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });
    const rows = await db
      .select()
      .from(declarations)
      .where(and(eq(declarations.companyId, companyId), isNull(declarations.archivedAt)))
      .orderBy(desc(declarations.createdAt));
    res.json({ canWrite: acc.canWrite, declarations: rows.map(serialize) });
  }),
);

meDeclarationsRouter.get(
  '/prefill',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'declarations');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canView) return res.status(403).json({ error: 'forbidden' });

    const rawOffset = Math.trunc(Number(req.query.offset));
    const offset = Number.isFinite(rawOffset) ? Math.min(0, Math.max(-MAX_WEEKS_BACK, rawOffset)) : 0;
    const { monday: start, sunday: end, label: weekLabel } = bizWeek(new Date(), offset);
    const f = await weekFigures(companyId, start, end);
    res.json({ weekLabel, weekStart: start, ...f });
  }),
);

const submitSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  declarantName: z.string().trim().min(1).max(120),
  caNet: z.number().nonnegative().finite().max(999_999_999_999.99),
  charges: z.number().nonnegative().finite().max(999_999_999_999.99),
  benefit: z.number().finite().min(-999_999_999_999.99).max(999_999_999_999.99),
  dividends: z.number().nonnegative().finite().max(999_999_999_999.99),
  email: z.string().email().max(150).optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

meDeclarationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const acc = await getModuleAccess(req.user!.id, companyId, 'declarations');
    if (!acc) return res.status(404).json({ error: 'not_member' });
    if (!acc.enabled || acc.blocked) return res.status(403).json({ error: 'module_unavailable' });
    if (!acc.canCreate) return res.status(403).json({ error: 'forbidden' });
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const week = bizWeek(new Date(`${d.weekStart}T12:00:00Z`));
    const current = bizWeek();
    if (week.monday !== d.weekStart || d.weekStart > current.monday || d.weekStart < bizWeek(new Date(), -MAX_WEEKS_BACK).monday) {
      return res.status(400).json({ error: 'bad_week' });
    }
    const ref = await weekFigures(companyId, week.monday, week.sunday);
    const benefit = round2(d.caNet - d.charges);
    const taxableBenefit = round2(Math.max(0, benefit + ref.nonDeductible));
    const taxes = await computeTaxes(taxableBenefit, d.dividends);
    const created = await db.transaction(async (tx) => {
      await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for('update');
      const dup = await tx
        .select({ id: declarations.id })
        .from(declarations)
        .where(
          and(
            eq(declarations.companyId, companyId),
            or(eq(declarations.weekStart, week.monday), eq(declarations.weekLabel, week.label)),
            isNull(declarations.archivedAt),
          ),
        )
        .limit(1);
      if (dup[0]) return false;
      await tx.insert(declarations).values({
        companyId,
        weekLabel: week.label,
        weekStart: week.monday,
        declarantName: d.declarantName,
        caNet: String(d.caNet),
        charges: String(d.charges),
        benefit: String(benefit),
        taxableBenefit: String(taxableBenefit),
        corporateTax: String(taxes.corporateTax),
        dividends: String(d.dividends),
        dividendTax: String(taxes.dividendTax),
        totalTax: String(taxes.totalTax),
        declaredByUserId: req.user!.id,
        email: d.email ? d.email : null,
        notes: d.notes ?? null,
      });
      return true;
    });
    if (!created) return res.status(409).json({ error: 'week_exists' });
    invalidateDeclaration(companyId);
    res.status(201).json({ ok: true });
  }),
);

export const irsDeclarationsRouter = Router();
irsDeclarationsRouter.use(requireAuth, requireAppRole('irs'));

irsDeclarationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const archived = req.query.archived === '1';
    const rows = await db
      .select({
        decl: declarations,
        companyName: companies.name,
      })
      .from(declarations)
      .innerJoin(companies, eq(declarations.companyId, companies.id))
      .where(archived ? isNotNull(declarations.archivedAt) : isNull(declarations.archivedAt))
      .orderBy(desc(archived ? declarations.archivedAt : declarations.createdAt));
    res.json(rows.map((r) => ({ ...serialize(r.decl), companyName: r.companyName })));
  }),
);

const statusSchema = z.object({ status: z.enum(['submitted', 'paid', 'cancelled']) });

irsDeclarationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ companyId: declarations.companyId, archivedAt: declarations.archivedAt })
      .from(declarations)
      .where(eq(declarations.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    if (existing[0].archivedAt) return res.status(409).json({ error: 'archived' });
    await db
      .update(declarations)
      .set({ status: parsed.data.status, paidAt: parsed.data.status === 'paid' ? new Date() : null })
      .where(eq(declarations.id, id));
    invalidateDeclaration(existing[0].companyId);
    res.json({ ok: true });
  }),
);

async function loadDeclaration(id: number) {
  const rows = await db
    .select({
      companyId: declarations.companyId,
      weekLabel: declarations.weekLabel,
      weekStart: declarations.weekStart,
      archivedAt: declarations.archivedAt,
      companyName: companies.name,
    })
    .from(declarations)
    .innerJoin(companies, eq(declarations.companyId, companies.id))
    .where(eq(declarations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

function invalidateDeclaration(companyId: number) {
  emitInvalidate(['irs'], [['irs-declarations'], ['irs-declarations-archived'], ['irs-overview']]);
  emitInvalidate([`company:${companyId}`], [['declarations', companyId], ['stats', companyId]]);
}

irsDeclarationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await loadDeclaration(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.archivedAt) return res.status(409).json({ error: 'already_archived' });
    await db.update(declarations).set({ archivedAt: new Date() }).where(eq(declarations.id, id));
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'declaration_archive',
      targetType: 'declaration',
      targetLabel: `${existing.companyName} — ${existing.weekLabel}`,
    });
    invalidateDeclaration(existing.companyId);
    res.json({ ok: true });
  }),
);

irsDeclarationsRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await loadDeclaration(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!existing.archivedAt) return res.status(409).json({ error: 'not_archived' });
    const clash = await db
      .select({ id: declarations.id })
      .from(declarations)
      .where(
        and(
          eq(declarations.companyId, existing.companyId),
          existing.weekStart
            ? or(eq(declarations.weekStart, existing.weekStart), eq(declarations.weekLabel, existing.weekLabel))
            : eq(declarations.weekLabel, existing.weekLabel),
          isNull(declarations.archivedAt),
          ne(declarations.id, id),
        ),
      )
      .limit(1);
    if (clash[0]) return res.status(409).json({ error: 'week_active_exists' });
    await db.update(declarations).set({ archivedAt: null }).where(eq(declarations.id, id));
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'declaration_restore',
      targetType: 'declaration',
      targetLabel: `${existing.companyName} — ${existing.weekLabel}`,
    });
    invalidateDeclaration(existing.companyId);
    res.json({ ok: true });
  }),
);

irsDeclarationsRouter.delete(
  '/:id/purge',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const existing = await loadDeclaration(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!existing.archivedAt) return res.status(409).json({ error: 'not_archived' });
    await db.delete(declarations).where(eq(declarations.id, id));
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'declaration_purge',
      targetType: 'declaration',
      targetLabel: `${existing.companyName} — ${existing.weekLabel}`,
    });
    invalidateDeclaration(existing.companyId);
    res.json({ ok: true });
  }),
);
