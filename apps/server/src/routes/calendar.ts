import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { events, companies, associations, memberships, companyRoles, associationMembers } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { isStaff } from '../services/access';
import { emitInvalidateAll } from '../realtime/socket';

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const DT_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
function normalizeDt(s: string): string {
  let v = s.replace('T', ' ');
  if (v.length === 16) v += ':00';
  return v;
}

interface Entity {
  type: 'company' | 'association';
  id: number;
  name: string;
  slug: string;
}

async function manageableEntities(userId: number, staff: boolean): Promise<Entity[]> {
  const out: Entity[] = [];
  if (staff) {
    const comps = await db
      .select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(isNull(companies.deletedAt));
    const assocs = await db.select({ id: associations.id, name: associations.name, slug: associations.slug }).from(associations);
    for (const c of comps) out.push({ type: 'company', id: c.id, name: c.name, slug: c.slug });
    for (const a of assocs) out.push({ type: 'association', id: a.id, name: a.name, slug: a.slug });
    return out;
  }
  const comps = await db
    .select({ id: companies.id, name: companies.name, slug: companies.slug })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .innerJoin(companies, eq(memberships.companyId, companies.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true), eq(companyRoles.canManage, true), isNull(companies.deletedAt)));
  for (const c of comps) out.push({ type: 'company', id: c.id, name: c.name, slug: c.slug });
  const assocs = await db
    .select({ id: associations.id, name: associations.name, slug: associations.slug })
    .from(associationMembers)
    .innerJoin(associations, eq(associationMembers.associationId, associations.id))
    .where(
      and(
        eq(associationMembers.userId, userId),
        eq(associationMembers.active, true),
        inArray(associationMembers.role, ['president', 'tresorier', 'secretaire']),
      ),
    );
  for (const a of assocs) out.push({ type: 'association', id: a.id, name: a.name, slug: a.slug });
  return out;
}

calendarRouter.get(
  '/entities',
  asyncHandler(async (req, res) => {
    const staff = await isStaff(req.user!.id);
    res.json({ entities: await manageableEntities(req.user!.id, staff) });
  }),
);

calendarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' && DT_RE.test(req.query.from) ? normalizeDt(req.query.from) : null;
    const to = typeof req.query.to === 'string' && DT_RE.test(req.query.to) ? normalizeDt(req.query.to) : null;
    if (!from || !to) return res.status(400).json({ error: 'bad_request' });

    const rows = await db
      .select()
      .from(events)
      .where(and(lt(events.startAt, to), gt(events.endAt, from)))
      .orderBy(asc(events.startAt));

    const compIds = [...new Set(rows.filter((r) => r.companyId).map((r) => r.companyId as number))];
    const assocIds = [...new Set(rows.filter((r) => r.associationId).map((r) => r.associationId as number))];
    const comps = compIds.length
      ? await db.select({ id: companies.id, name: companies.name, slug: companies.slug }).from(companies).where(inArray(companies.id, compIds))
      : [];
    const assocs = assocIds.length
      ? await db.select({ id: associations.id, name: associations.name, slug: associations.slug }).from(associations).where(inArray(associations.id, assocIds))
      : [];
    const compMap = new Map(comps.map((c) => [c.id, c]));
    const assocMap = new Map(assocs.map((a) => [a.id, a]));

    const staff = await isStaff(req.user!.id);
    const mine = await manageableEntities(req.user!.id, staff);
    const mineSet = new Set(mine.map((e) => `${e.type}:${e.id}`));

    res.json({
      events: rows.map((r) => {
        const ownerId = r.ownerType === 'company' ? r.companyId : r.associationId;
        const live = r.ownerType === 'company' ? (r.companyId ? compMap.get(r.companyId) : null) : r.associationId ? assocMap.get(r.associationId) : null;
        return {
          id: r.id,
          title: r.title,
          category: r.category,
          ownerType: r.ownerType,
          ownerId,
          ownerName: live?.name ?? r.ownerName,
          ownerSlug: live?.slug ?? null,
          startAt: r.startAt,
          endAt: r.endAt,
          canManage: staff || r.createdByUserId === req.user!.id || (ownerId !== null && mineSet.has(`${r.ownerType}:${ownerId}`)),
        };
      }),
    });
  }),
);

const createSchema = z.object({
  title: z.string().trim().min(1).max(150),
  category: z.string().trim().max(80).nullish(),
  ownerType: z.enum(['company', 'association']),
  ownerId: z.number().int().positive(),
  startAt: z.string().regex(DT_RE),
  endAt: z.string().regex(DT_RE),
});

calendarRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;
    const start = normalizeDt(d.startAt);
    const end = normalizeDt(d.endAt);
    if (end <= start) return res.status(400).json({ error: 'invalid_range' });

    const staff = await isStaff(req.user!.id);
    const mine = await manageableEntities(req.user!.id, staff);
    const entity = mine.find((e) => e.type === d.ownerType && e.id === d.ownerId);
    if (!entity) return res.status(403).json({ error: 'forbidden' });

    await db.insert(events).values({
      title: d.title,
      category: d.category?.trim() || null,
      ownerType: d.ownerType,
      companyId: d.ownerType === 'company' ? d.ownerId : null,
      associationId: d.ownerType === 'association' ? d.ownerId : null,
      ownerName: entity.name,
      startAt: start,
      endAt: end,
      createdByUserId: req.user!.id,
    });
    emitInvalidateAll([['calendar']]);
    res.status(201).json({ ok: true });
  }),
);

calendarRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
    const ev = rows[0];
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const staff = await isStaff(req.user!.id);
    const ownerId = ev.ownerType === 'company' ? ev.companyId : ev.associationId;
    let allowed = staff || ev.createdByUserId === req.user!.id;
    if (!allowed && ownerId !== null) {
      const mine = await manageableEntities(req.user!.id, staff);
      allowed = mine.some((e) => e.type === ev.ownerType && e.id === ownerId);
    }
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    await db.delete(events).where(eq(events.id, id));
    emitInvalidateAll([['calendar']]);
    res.json({ ok: true });
  }),
);
