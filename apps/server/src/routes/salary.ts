import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { EMPLOYEE_POSITION_KEYS, type EmployeePosition } from '@rp-compta/shared';
import { db } from '../db';
import { salaryGrid } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function gate(userId: number, companyId: number, write: boolean) {
  const acc = await getModuleAccess(userId, companyId, 'rh');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (write && !acc.canWrite) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const meSalaryRouter = Router({ mergeParams: true });
meSalaryRouter.use(requireAuth);

meSalaryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, false);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const rows = await db.select().from(salaryGrid).where(eq(salaryGrid.companyId, companyId));
    const byPos = new Map(rows.map((r) => [r.position, r]));
    const grid = EMPLOYEE_POSITION_KEYS.map((position) => {
      const r = byPos.get(position);
      return {
        position,
        hourlyRate: r ? Number(r.hourlyRate) : 0,
        baseSalary: r ? Number(r.baseSalary) : 0,
      };
    });
    res.json({ canWrite: g.canWrite, grid });
  }),
);

const putSchema = z.object({
  grid: z
    .array(
      z.object({
        position: z.enum(EMPLOYEE_POSITION_KEYS as [string, ...string[]]),
        hourlyRate: z.number().nonnegative().finite().max(99_999_999.99),
        baseSalary: z.number().nonnegative().finite().max(9_999_999_999.99),
      }),
    )
    .max(EMPLOYEE_POSITION_KEYS.length)
    .refine((g) => new Set(g.map((r) => r.position)).size === g.length, 'duplicate_position'),
});

meSalaryRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    for (const row of parsed.data.grid) {
      await db
        .insert(salaryGrid)
        .values({
          companyId,
          position: row.position as EmployeePosition,
          hourlyRate: String(round2(row.hourlyRate)),
          baseSalary: String(round2(row.baseSalary)),
        })
        .onDuplicateKeyUpdate({
          set: {
            hourlyRate: String(round2(row.hourlyRate)),
            baseSalary: String(round2(row.baseSalary)),
          },
        });
    }
    emitInvalidate(['irs', `company:${companyId}`], [['salary-grid', companyId]]);
    res.json({ ok: true });
  }),
);
