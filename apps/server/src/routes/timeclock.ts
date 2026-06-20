import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { timeEntries, companyEmployees } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function minutesBetween(inStr: string, outStr: string | null): number | null {
  if (!outStr) return null;
  const a = new Date(inStr.replace(' ', 'T')).getTime();
  const b = new Date(outStr.replace(' ', 'T')).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const meTimeclockRouter = Router({ mergeParams: true });
meTimeclockRouter.use(requireAuth);

async function gate(userId: number, companyId: number, write: boolean) {
  const acc = await getModuleAccess(userId, companyId, 'badgeuse');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (write && !acc.canWrite) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite };
}

meTimeclockRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, false);
    if (!g.ok) return res.status(g.status).json({ error: g.error });

    const [emps, entries] = await Promise.all([
      db.select().from(companyEmployees).where(eq(companyEmployees.companyId, companyId)).orderBy(asc(companyEmployees.name)),
      db.select().from(timeEntries).where(eq(timeEntries.companyId, companyId)).orderBy(asc(timeEntries.clockIn)),
    ]);

    const byEmp = new Map<number, typeof entries>();
    for (const e of entries) {
      const arr = byEmp.get(e.employeeId) ?? [];
      arr.push(e);
      byEmp.set(e.employeeId, arr);
    }

    const employees = emps.map((emp) => {
      const rate = Number(emp.hourlyRate);
      const raw = (byEmp.get(emp.id) ?? []).slice().reverse();
      const days = new Set<string>();
      let totalMin = 0;
      let totalSalary = 0;
      const list = raw.map((t) => {
        const minutes = minutesBetween(t.clockIn, t.clockOut);
        const salary = minutes === null ? 0 : round2((minutes / 60) * rate);
        days.add(t.clockIn.slice(0, 10));
        if (minutes !== null) {
          totalMin += minutes;
          totalSalary += salary;
        }
        return { id: t.id, clockIn: t.clockIn, clockOut: t.clockOut, minutes, salary };
      });
      return {
        id: emp.id,
        name: emp.name,
        position: emp.position,
        hourlyRate: rate,
        active: emp.active,
        entries: list,
        totals: { minutes: totalMin, salary: round2(totalSalary), days: days.size },
      };
    });

    res.json({ canWrite: g.canWrite, employees });
  }),
);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const createSchema = z.object({
  employeeId: z.number().int().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, 'invalid_date'),
  clockIn: time,
  clockOut: time.optional(),
});

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

meTimeclockRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;

    const emp = await db
      .select({ id: companyEmployees.id })
      .from(companyEmployees)
      .where(and(eq(companyEmployees.id, d.employeeId), eq(companyEmployees.companyId, companyId)))
      .limit(1);
    if (!emp[0]) return res.status(404).json({ error: 'employee_not_found' });

    const clockIn = `${d.date} ${d.clockIn}:00`;
    let clockOut: string | null = null;
    if (d.clockOut) {
      const outDate = d.clockOut < d.clockIn ? addDay(d.date) : d.date;
      clockOut = `${outDate} ${d.clockOut}:00`;
    }

    await db.insert(timeEntries).values({ companyId, employeeId: d.employeeId, clockIn, clockOut });
    emitInvalidate(['irs', `company:${companyId}`], [['timeclock', companyId]]);
    res.status(201).json({ ok: true });
  }),
);

meTimeclockRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, true);
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['timeclock', companyId]]);
    res.json({ ok: true });
  }),
);
