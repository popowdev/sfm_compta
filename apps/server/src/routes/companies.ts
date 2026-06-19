import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { MODULE_KEYS, MODULES, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { companies, companyModules, type Company } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { slugify, uniqueSlug } from '../services/companies';
import { getEffectiveModules, isModuleBlocked } from '../services/modules';
import { emitInvalidate } from '../realtime/socket';

export const companiesRouter = Router();

companiesRouter.use(requireAuth, requireAppRole('irs'));

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function findActiveCompany(id: number): Promise<Company | null> {
  const rows = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

companiesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(companies)
      .where(isNull(companies.deletedAt))
      .orderBy(companies.name);
    res.json(rows);
  }),
);

const createSchema = z.object({
  name: z.string().min(1).max(150),
  fivemJob: z.string().max(64).optional(),
  logoUrl: z.string().url().max(255).optional(),
});

companiesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const slug = await uniqueSlug(slugify(parsed.data.name));
    const id = await db.transaction(async (tx) => {
      const inserted = await tx.insert(companies).values({
        name: parsed.data.name,
        slug,
        fivemJob: parsed.data.fivemJob ?? null,
        logoUrl: parsed.data.logoUrl ?? null,
      });
      const newId = inserted[0].insertId;
      await tx
        .insert(companyModules)
        .values(MODULES.map((m) => ({ companyId: newId, moduleKey: m.key, enabled: m.defaultEnabled })));
      return newId;
    });
    const created = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    emitInvalidate('irs', [['companies']]);
    res.status(201).json(created[0]);
  }),
);

const patchSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  fivemJob: z.string().max(64).nullable().optional(),
  logoUrl: z.string().url().max(255).nullable().optional(),
  active: z.boolean().optional(),
});

companiesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await findActiveCompany(id))) return res.status(404).json({ error: 'not_found' });
    if (Object.keys(parsed.data).length > 0) {
      await db.update(companies).set(parsed.data).where(eq(companies.id, id));
    }
    const updated = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    emitInvalidate('irs', [['companies']]);
    res.json(updated[0]);
  }),
);

companiesRouter.get(
  '/:id/modules',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    if (!(await findActiveCompany(id))) return res.status(404).json({ error: 'not_found' });
    const rows = await db.select().from(companyModules).where(eq(companyModules.companyId, id));
    const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
    const effective = await getEffectiveModules();
    const result = effective.map((m) => ({
      key: m.key,
      label: m.label,
      group: m.group,
      blocked: m.blocked,
      enabled: byKey.get(m.key)?.enabled ?? m.defaultEnabled,
      config: byKey.get(m.key)?.config ?? null,
    }));
    res.json(result);
  }),
);

const toggleSchema = z.object({ enabled: z.boolean() });

companiesRouter.put(
  '/:id/modules/:key',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const key = req.params.key;
    if (!id || !key || !(MODULE_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await findActiveCompany(id))) return res.status(404).json({ error: 'not_found' });
    const moduleKey = key as ModuleKey;
    if (await isModuleBlocked(moduleKey)) return res.status(409).json({ error: 'module_blocked' });
    await db
      .insert(companyModules)
      .values({ companyId: id, moduleKey, enabled: parsed.data.enabled })
      .onDuplicateKeyUpdate({ set: { enabled: parsed.data.enabled } });
    emitInvalidate(['irs', `company:${id}`], [['company-modules', id], ['companies']]);
    res.json({ ok: true });
  }),
);
