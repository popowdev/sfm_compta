import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { dividendPayouts, companies, users } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { getFiscalConfig } from '../services/fiscal';
import { recordAudit } from '../services/audit';
import { emitInvalidate } from '../realtime/socket';

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}
function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const blank = (v: string | null | undefined) => (v ? v : null);
const ref = (id: number) => `DIV-${String(id).padStart(6, '0')}`;

function serialize(r: typeof dividendPayouts.$inferSelect & { companyName?: string | null; declaredBy?: string | null }) {
  return {
    id: r.id,
    reference: ref(r.id),
    companyId: r.companyId,
    companyName: r.companyName ?? null,
    shareholderName: r.shareholderName,
    rib: r.rib,
    gross: Number(r.gross),
    taxRate: Number(r.taxRate),
    tax: Number(r.tax),
    net: Number(r.net),
    status: r.status,
    transferValidated: r.transferValidated,
    notes: r.notes,
    declaredBy: r.declaredBy ?? null,
    createdAt: r.createdAt,
  };
}

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'dividendes');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) {
    return { ok: false as const, status: 403, error: 'forbidden' };
  }
  return { ok: true as const, canWrite: acc.canWrite };
}

const createSchema = z.object({
  shareholderName: z.string().trim().min(1).max(150),
  rib: z.string().trim().min(1).max(40),
  gross: z.number().nonnegative().finite().max(999_999_999.99),
  notes: z.string().trim().max(300).nullish().or(z.literal('')),
});

export const meDividendsRouter = Router({ mergeParams: true });
meDividendsRouter.use(requireAuth);

meDividendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select({ p: dividendPayouts, declaredBy: users.displayName })
      .from(dividendPayouts)
      .leftJoin(users, eq(dividendPayouts.declaredByUserId, users.id))
      .where(eq(dividendPayouts.companyId, companyId))
      .orderBy(desc(dividendPayouts.createdAt));
    const cfg = await getFiscalConfig();
    res.json({
      canWrite: g.canWrite,
      dividendTaxRate: cfg.dividendTaxRate,
      payouts: rows.map((r) => serialize({ ...r.p, declaredBy: r.declaredBy })),
    });
  }),
);

meDividendsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const cfg = await getFiscalConfig();
    const gross = round2(parsed.data.gross);
    const tax = round2((gross * cfg.dividendTaxRate) / 100);
    const net = round2(gross - tax);
    await db.insert(dividendPayouts).values({
      companyId,
      shareholderName: parsed.data.shareholderName,
      rib: blank(parsed.data.rib),
      gross: String(gross),
      taxRate: String(cfg.dividendTaxRate),
      tax: String(tax),
      net: String(net),
      notes: blank(parsed.data.notes),
      declaredByUserId: req.user!.id,
    });
    emitInvalidate(['irs', `company:${companyId}`], [['dividends', companyId], ['irs-dividends']]);
    res.status(201).json({ ok: true });
  }),
);

meDividendsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(dividendPayouts)
      .where(and(eq(dividendPayouts.id, id), eq(dividendPayouts.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['dividends', companyId], ['irs-dividends']]);
    res.json({ ok: true });
  }),
);

export const irsDividendsRouter = Router();
irsDividendsRouter.use(requireAuth, requireAppRole('irs'));

irsDividendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.query.companyId as string | undefined);
    const base = db
      .select({ p: dividendPayouts, companyName: companies.name, declaredBy: users.displayName })
      .from(dividendPayouts)
      .innerJoin(companies, eq(dividendPayouts.companyId, companies.id))
      .leftJoin(users, eq(dividendPayouts.declaredByUserId, users.id));
    const rows = companyId
      ? await base.where(eq(dividendPayouts.companyId, companyId)).orderBy(desc(dividendPayouts.createdAt))
      : await base.orderBy(desc(dividendPayouts.createdAt));
    res.json({
      payouts: rows.map((r) => serialize({ ...r.p, companyName: r.companyName, declaredBy: r.declaredBy })),
    });
  }),
);

const decisionSchema = z.object({
  status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  transferValidated: z.boolean().optional(),
});

irsDividendsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const existing = await db
      .select({ companyId: dividendPayouts.companyId, shareholderName: dividendPayouts.shareholderName })
      .from(dividendPayouts)
      .where(eq(dividendPayouts.id, id))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    const updates: Partial<typeof dividendPayouts.$inferInsert> = {};
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.transferValidated !== undefined) updates.transferValidated = parsed.data.transferValidated;
    if (Object.keys(updates).length === 0) return res.json({ ok: true });
    await db.update(dividendPayouts).set(updates).where(eq(dividendPayouts.id, id));
    emitInvalidate(['irs', `company:${existing[0].companyId}`], [
      ['irs-dividends'],
      ['dividends', existing[0].companyId],
    ]);
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action:
        parsed.data.status !== undefined
          ? `dividend_${parsed.data.status}`
          : parsed.data.transferValidated
            ? 'dividend_transfer_ok'
            : 'dividend_transfer_off',
      targetType: 'dividende',
      targetLabel: `${ref(id)} · ${existing[0].shareholderName}`,
    });
    res.json({ ok: true });
  }),
);
