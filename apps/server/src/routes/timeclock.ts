import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import { timeEntries, companyEmployees, companyRoles, companyModules } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getModuleAccess, actionDenied, type PermAction } from '../services/access';
import { emitInvalidate } from '../realtime/socket';

type Entry = typeof timeEntries.$inferSelect;

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function weekBounds(): { from: string; to: string } {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

async function weeklyHoursCapFor(companyId: number): Promise<number> {
  const rows = await db
    .select({ config: companyModules.config })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'badgeuse')))
    .limit(1);
  const raw = rows[0]?.config;
  const cfg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
  return moduleConfigNumber(cfg, 'badgeuse', 'weeklyHoursCap');
}

async function weekWorkedHours(companyId: number, employeeId: number): Promise<number> {
  const { from, to } = weekBounds();
  const rows = await db
    .select({
      mins: sql<string>`COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(MINUTE, ${timeEntries.clockIn}, ${timeEntries.clockOut}) - ${timeEntries.pauseMinutes})), 0)`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.companyId, companyId),
        eq(timeEntries.employeeId, employeeId),
        isNotNull(timeEntries.clockOut),
        gte(sql`DATE(${timeEntries.clockIn})`, from),
        lte(sql`DATE(${timeEntries.clockIn})`, to),
      ),
    );
  return Number(rows[0]?.mins ?? 0) / 60;
}

function minutesBetween(a: string, b: string | null): number | null {
  if (!b) return null;
  const x = new Date(a.replace(' ', 'T')).getTime();
  const y = new Date(b.replace(' ', 'T')).getTime();
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.max(0, Math.round((y - x) / 60000));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function computeEntry(t: Entry, rate: number, now: string) {
  const end = t.clockOut ?? now;
  const gross = minutesBetween(t.clockIn, end) ?? 0;
  const livePause = !t.clockOut && t.pauseStart ? (minutesBetween(t.pauseStart, now) ?? 0) : 0;
  const pause = t.pauseMinutes + livePause;
  const worked = Math.max(0, gross - pause);
  return {
    id: t.id,
    clockIn: t.clockIn,
    clockOut: t.clockOut,
    workedMinutes: worked,
    pauseMinutes: pause,
    salary: Math.round((worked / 60) * rate),
    complete: t.clockOut !== null,
  };
}

export const meTimeclockRouter = Router({ mergeParams: true });
meTimeclockRouter.use(requireAuth);

async function gate(userId: number, companyId: number, action: PermAction) {
  const acc = await getModuleAccess(userId, companyId, 'badgeuse');
  if (!acc) return { ok: false as const, status: 404, error: 'not_member' };
  if (!acc.enabled || acc.blocked) return { ok: false as const, status: 403, error: 'module_unavailable' };
  if (!acc.canView) return { ok: false as const, status: 403, error: 'forbidden' };
  if (actionDenied(acc, action)) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, canWrite: acc.canWrite, canEdit: acc.canEdit, canDelete: acc.canDelete };
}

async function myEmployee(userId: number, companyId: number) {
  const rows = await db
    .select()
    .from(companyEmployees)
    .where(and(eq(companyEmployees.companyId, companyId), eq(companyEmployees.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function openEntry(employeeId: number) {
  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.employeeId, employeeId), isNull(timeEntries.clockOut)))
    .orderBy(desc(timeEntries.clockIn));
  // Self-heal a concurrency race: at most one open entry per employee.
  // Close any orphan opens at zero duration (clockOut = clockIn).
  for (const r of rows.slice(1)) {
    await db
      .update(timeEntries)
      .set({ clockOut: r.clockIn, pauseStart: null })
      .where(eq(timeEntries.id, r.id));
  }
  return rows[0] ?? null;
}

// --- Self-service (requires canView) ---

meTimeclockRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, 'view');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const emp = await myEmployee(req.user!.id, companyId);
    if (!emp) {
      return res.json({ canManageTeam: g.canWrite, employee: null, current: null, recent: [], now: nowStr() });
    }
    const rate = Number(emp.hourlyRate);
    const open = await openEntry(emp.id);
    const now = nowStr();
    const rows = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.employeeId, emp.id))
      .orderBy(desc(timeEntries.clockIn))
      .limit(20);
    res.json({
      canManageTeam: g.canWrite,
      employee: { id: emp.id, name: emp.name, hourlyRate: rate },
      current: open
        ? { id: open.id, clockIn: open.clockIn, pauseStart: open.pauseStart, pauseMinutes: open.pauseMinutes }
        : null,
      recent: rows.map((r) => computeEntry(r, rate, now)),
      now,
    });
  }),
);

type ActionErr = { status: number; error: string } | void;

async function selfAction(
  req: Request,
  res: Response,
  fn: (emp: NonNullable<Awaited<ReturnType<typeof myEmployee>>>, open: Entry | null) => Promise<ActionErr>,
) {
  const companyId = parseId(req.params.companyId);
  if (!companyId) return res.status(400).json({ error: 'bad_request' });
  const g = await gate(req.user!.id, companyId, 'view');
  if (!g.ok) return res.status(g.status).json({ error: g.error });
  const emp = await myEmployee(req.user!.id, companyId);
  if (!emp) return res.status(404).json({ error: 'no_fiche' });
  const open = await openEntry(emp.id);
  const err = await fn(emp, open);
  if (err) return res.status(err.status).json({ error: err.error });
  emitInvalidate(['irs', `company:${companyId}`], [['timeclock', companyId], ['timeclock-me', companyId]]);
  res.json({ ok: true });
}

meTimeclockRouter.post(
  '/me/start',
  asyncHandler(async (req, res) => {
    await selfAction(req, res, async (emp, open) => {
      if (open) return { status: 409, error: 'already_open' };
      const cap = await weeklyHoursCapFor(emp.companyId);
      if (cap > 0 && (await weekWorkedHours(emp.companyId, emp.id)) >= cap) {
        return { status: 409, error: 'week_hours_cap' };
      }
      await db.insert(timeEntries).values({ companyId: emp.companyId, employeeId: emp.id, clockIn: nowStr() });
    });
  }),
);

meTimeclockRouter.post(
  '/me/pause',
  asyncHandler(async (req, res) => {
    await selfAction(req, res, async (_emp, open) => {
      if (!open) return { status: 409, error: 'not_open' };
      if (open.pauseStart) return { status: 409, error: 'already_paused' };
      await db.update(timeEntries).set({ pauseStart: nowStr() }).where(eq(timeEntries.id, open.id));
    });
  }),
);

meTimeclockRouter.post(
  '/me/resume',
  asyncHandler(async (req, res) => {
    await selfAction(req, res, async (_emp, open) => {
      if (!open || !open.pauseStart) return { status: 409, error: 'not_paused' };
      const add = minutesBetween(open.pauseStart, nowStr()) ?? 0;
      await db
        .update(timeEntries)
        .set({ pauseStart: null, pauseMinutes: open.pauseMinutes + add })
        .where(eq(timeEntries.id, open.id));
    });
  }),
);

meTimeclockRouter.post(
  '/me/stop',
  asyncHandler(async (req, res) => {
    await selfAction(req, res, async (_emp, open) => {
      if (!open) return { status: 409, error: 'not_open' };
      const now = nowStr();
      const extra = open.pauseStart ? (minutesBetween(open.pauseStart, now) ?? 0) : 0;
      await db
        .update(timeEntries)
        .set({ clockOut: now, pauseStart: null, pauseMinutes: open.pauseMinutes + extra })
        .where(eq(timeEntries.id, open.id));
    });
  }),
);

// --- Team view (requires canWrite) ---

meTimeclockRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, 'view');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    if (!g.canWrite) return res.status(403).json({ error: 'forbidden' });

    const now = nowStr();
    const [emps, entries, roles] = await Promise.all([
      db.select().from(companyEmployees).where(eq(companyEmployees.companyId, companyId)).orderBy(asc(companyEmployees.name)),
      db.select().from(timeEntries).where(eq(timeEntries.companyId, companyId)).orderBy(asc(timeEntries.clockIn)),
      db.select({ id: companyRoles.id, name: companyRoles.name }).from(companyRoles).where(eq(companyRoles.companyId, companyId)),
    ]);
    const roleName = new Map(roles.map((r) => [r.id, r.name]));

    const byEmp = new Map<number, Entry[]>();
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
        const c = computeEntry(t, rate, now);
        days.add(t.clockIn.slice(0, 10));
        totalMin += c.workedMinutes;
        totalSalary += c.salary;
        return c;
      });
      return {
        id: emp.id,
        name: emp.name,
        grade: emp.companyRoleId != null ? (roleName.get(emp.companyRoleId) ?? null) : null,
        hourlyRate: rate,
        active: emp.active,
        entries: list,
        totals: { minutes: totalMin, salary: Math.round(totalSalary), days: days.size },
      };
    });

    res.json({ canWrite: g.canWrite, canEdit: g.canEdit, canDelete: g.canDelete, employees });
  }),
);

const timeRe = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const createSchema = z.object({
  employeeId: z.number().int().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, 'invalid_date'),
  clockIn: timeRe,
  clockOut: timeRe.optional(),
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
    const g = await gate(req.user!.id, companyId, 'create');
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

const editSchema = createSchema.omit({ employeeId: true });

meTimeclockRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, 'edit');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;

    const existing = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.companyId, companyId)))
      .limit(1);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });

    const clockIn = `${d.date} ${d.clockIn}:00`;
    let clockOut: string | null = null;
    if (d.clockOut) {
      const outDate = d.clockOut < d.clockIn ? addDay(d.date) : d.date;
      clockOut = `${outDate} ${d.clockOut}:00`;
    }
    await db
      .update(timeEntries)
      .set({ clockIn, clockOut, pauseStart: null })
      .where(and(eq(timeEntries.id, id), eq(timeEntries.companyId, companyId)));
    emitInvalidate(['irs', `company:${companyId}`], [['timeclock', companyId]]);
    res.json({ ok: true });
  }),
);

meTimeclockRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = parseId(req.params.companyId);
    const id = parseId(req.params.id);
    if (!companyId || !id) return res.status(400).json({ error: 'bad_request' });
    const g = await gate(req.user!.id, companyId, 'delete');
    if (!g.ok) return res.status(g.status).json({ error: g.error });
    const result = await db
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.companyId, companyId)));
    if (!result[0].affectedRows) return res.status(404).json({ error: 'not_found' });
    emitInvalidate(['irs', `company:${companyId}`], [['timeclock', companyId]]);
    res.json({ ok: true });
  }),
);
