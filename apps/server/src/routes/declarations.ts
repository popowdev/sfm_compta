import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { declarations, companies } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { computeTaxes } from '../services/declarations';
import { emitInvalidate } from '../realtime/socket';

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
    declarantName: d.declarantName,
    caNet: num(d.caNet),
    charges: num(d.charges),
    benefit: num(d.benefit),
    corporateTax: num(d.corporateTax),
    dividends: num(d.dividends),
    dividendTax: num(d.dividendTax),
    totalTax: num(d.totalTax),
    status: d.status,
    email: d.email,
    notes: d.notes,
    createdAt: d.createdAt,
    paidAt: d.paidAt,
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
      .where(eq(declarations.companyId, companyId))
      .orderBy(desc(declarations.createdAt));
    res.json({ canWrite: acc.canWrite, declarations: rows.map(serialize) });
  }),
);

const submitSchema = z.object({
  weekLabel: z.string().trim().min(1).max(60),
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
    const taxes = await computeTaxes(d.benefit, d.dividends);
    await db.insert(declarations).values({
      companyId,
      weekLabel: d.weekLabel,
      declarantName: d.declarantName,
      caNet: String(d.caNet),
      charges: String(d.charges),
      benefit: String(d.benefit),
      corporateTax: String(taxes.corporateTax),
      dividends: String(d.dividends),
      dividendTax: String(taxes.dividendTax),
      totalTax: String(taxes.totalTax),
      declaredByUserId: req.user!.id,
      email: d.email ? d.email : null,
      notes: d.notes ?? null,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['declarations', companyId], ['irs-declarations']]);
    res.status(201).json({ ok: true });
  }),
);

export const irsDeclarationsRouter = Router();
irsDeclarationsRouter.use(requireAuth, requireAppRole('irs'));

irsDeclarationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        decl: declarations,
        companyName: companies.name,
      })
      .from(declarations)
      .innerJoin(companies, eq(declarations.companyId, companies.id))
      .orderBy(desc(declarations.createdAt));
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
      .select({ companyId: declarations.companyId })
      .from(declarations)
      .where(eq(declarations.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    await db
      .update(declarations)
      .set({ status: parsed.data.status, paidAt: parsed.data.status === 'paid' ? new Date() : null })
      .where(eq(declarations.id, id));
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-declarations'],
      ['declarations', existing[0].companyId],
    ]);
    res.json({ ok: true });
  }),
);
