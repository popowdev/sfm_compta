import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { MODULE_KEYS, MODULES, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { companies, companyModules } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { slugify, uniqueSlug, seedCompanyModules } from '../services/companies';

export const companiesRouter = Router();

companiesRouter.use(requireAuth, requireAppRole('irs'));

companiesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(companies).orderBy(companies.name);
    res.json(rows.filter((c) => !c.deletedAt));
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
    const inserted = await db.insert(companies).values({
      name: parsed.data.name,
      slug,
      fivemJob: parsed.data.fivemJob ?? null,
      logoUrl: parsed.data.logoUrl ?? null,
    });
    const id = inserted[0].insertId;
    await seedCompanyModules(id);
    const created = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_request' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (Object.keys(parsed.data).length > 0) {
      await db.update(companies).set(parsed.data).where(eq(companies.id, id));
    }
    const updated = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!updated[0]) return res.status(404).json({ error: 'not_found' });
    res.json(updated[0]);
  }),
);

companiesRouter.get(
  '/:id/modules',
  asyncHandler(async (req, res) => {
    const companyId = Number(req.params.id);
    if (!Number.isInteger(companyId)) return res.status(400).json({ error: 'bad_request' });
    const rows = await db
      .select()
      .from(companyModules)
      .where(eq(companyModules.companyId, companyId));
    const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
    const result = MODULES.map((m) => ({
      key: m.key,
      label: m.label,
      group: m.group,
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
    const companyId = Number(req.params.id);
    const key = req.params.key;
    if (!Number.isInteger(companyId) || !key || !(MODULE_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const moduleKey = key as ModuleKey;
    const existing = await db
      .select({ id: companyModules.id })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, moduleKey)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(companyModules)
        .set({ enabled: parsed.data.enabled })
        .where(eq(companyModules.id, existing[0].id));
    } else {
      await db.insert(companyModules).values({ companyId, moduleKey, enabled: parsed.data.enabled });
    }
    res.json({ ok: true });
  }),
);
