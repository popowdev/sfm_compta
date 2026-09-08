import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { EXPENSE_CATEGORY_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { companyExpenses } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitCompta } from '../realtime/socket';
import { recordAudit } from '../services/audit';

function methodAction(method: string): PermAction {
  return method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : 'view';
}

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serialize(e: typeof companyExpenses.$inferSelect) {
  return {
    id: e.id,
    companyId: e.companyId,
    label: e.label,
    category: e.category,
    amount: Number(e.amount),
    taxDeductible: e.taxDeductible,
    expenseDate: e.expenseDate,
    notes: e.notes,
    createdAt: e.createdAt,
  };
}

const bodySchema = z.object({
  label: z.string().trim().min(1).max(200),
  category: z.enum(EXPENSE_CATEGORY_KEYS.filter((k) => k !== 'salary') as [string, ...string[]]),
  amount: z.number().nonnegative().finite().max(999_999_999_999.99),
  taxDeductible: z.boolean().optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, 'invalid_date'),
  notes: z.string().max(2000).optional(),
});

export const meExpensesRouter = Router({ mergeParams: true });
meExpensesRouter.use(requireAuth);

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'depenses');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, methodAction(req.method))) return { ok: false as const, status: 403, error: 'forbidden' };
  return {
    ok: true as const,
    canWrite: acc.canWrite,
    canCreate: acc.canCreate,
    canEdit: acc.canEdit,
    canDelete: acc.canDelete,
  };
}

meExpensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db
      .select()
      .from(companyExpenses)
      .where(eq(companyExpenses.companyId, companyId))
      .orderBy(desc(companyExpenses.expenseDate), desc(companyExpenses.createdAt));
    res.json({ canWrite: g.canWrite, expenses: rows.map(serialize) });
  }),
);

meExpensesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    await db.insert(companyExpenses).values({
      companyId,
      label: d.label,
      category: d.category as (typeof companyExpenses.$inferInsert)['category'],
      amount: String(d.amount),
      taxDeductible: d.taxDeductible ?? false,
      expenseDate: d.expenseDate,
      notes: d.notes ?? null,
      createdByUserId: req.user!.id,
    });
    emitCompta(companyId, [['expenses', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meExpensesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const result = await db
      .update(companyExpenses)
      .set({
        label: d.label,
        category: d.category as (typeof companyExpenses.$inferInsert)['category'],
        amount: String(d.amount),
        taxDeductible: d.taxDeductible ?? false,
        expenseDate: d.expenseDate,
        notes: d.notes ?? null,
      })
      .where(and(eq(companyExpenses.id, id), eq(companyExpenses.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitCompta(companyId, [['expenses', companyId]]);
    res.json({ ok: true });
  }),
);

meExpensesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(companyExpenses)
      .where(and(eq(companyExpenses.id, id), eq(companyExpenses.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'expense_delete',
      targetType: 'expense',
      targetLabel: `#${id}`,
      detail: `entreprise ${companyId}`,
    });
    emitCompta(companyId, [['expenses', companyId]]);
    res.json({ ok: true });
  }),
);
