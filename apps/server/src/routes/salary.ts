import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { salaryGrid, companyRoles } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function gate(req: Request, companyId: number) {
  const acc = await getModuleAccess(req.user!.id, companyId, 'rh');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (req.method !== 'GET' && !acc.canWrite) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite, canCreate: acc.canCreate, canEdit: acc.canEdit, canDelete: acc.canDelete };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const meSalaryRouter = Router({ mergeParams: true });
meSalaryRouter.use(requireAuth);

meSalaryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const [grades, rows] = await Promise.all([
      db.select().from(companyRoles).where(eq(companyRoles.companyId, companyId)).orderBy(companyRoles.rank),
      db.select().from(salaryGrid).where(eq(salaryGrid.companyId, companyId)),
    ]);
    const byRole = new Map(rows.map((r) => [r.companyRoleId, r]));
    const grid = grades.map((role) => {
      const r = byRole.get(role.id);
      return {
        companyRoleId: role.id,
        gradeName: role.name,
        rank: role.rank,
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
        companyRoleId: z.number().int().positive(),
        hourlyRate: z.number().nonnegative().finite().max(99_999_999),
        baseSalary: z.number().nonnegative().finite().max(9_999_999_999),
      }),
    )
    .max(200)
    .refine((g) => new Set(g.map((r) => r.companyRoleId)).size === g.length, 'duplicate_role'),
});

meSalaryRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req, companyId);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canDelete) return res.status(403).json({ error: 'forbidden' });
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    const roleIds = parsed.data.grid.map((r) => r.companyRoleId);
    if (roleIds.length) {
      const valid = await db
        .select({ id: companyRoles.id })
        .from(companyRoles)
        .where(and(eq(companyRoles.companyId, companyId), inArray(companyRoles.id, roleIds)));
      const validSet = new Set(valid.map((v) => v.id));
      if (roleIds.some((id) => !validSet.has(id))) return res.status(400).json({ error: 'invalid_grade' });
    }
    for (const row of parsed.data.grid) {
      await db
        .insert(salaryGrid)
        .values({
          companyId,
          companyRoleId: row.companyRoleId,
          hourlyRate: String(Math.round(row.hourlyRate)),
          baseSalary: String(Math.round(row.baseSalary)),
        })
        .onDuplicateKeyUpdate({
          set: {
            hourlyRate: String(Math.round(row.hourlyRate)),
            baseSalary: String(Math.round(row.baseSalary)),
          },
        });
    }
    emitInvalidate(['irs', `company:${companyId}`], [['salary-grid', companyId]]);
    res.json({ ok: true });
  }),
);
