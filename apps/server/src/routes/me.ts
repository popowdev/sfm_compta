import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { MODULE_KEYS, MODULE_CONFIG, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { memberships, companies, companyRoles, companyModules, rolePermissions } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getEffectiveModules, isModuleBlocked } from '../services/modules';
import { isStaff, canManageCompany } from '../services/access';
import { companyLogoUpload, companyLogoUrl } from '../services/upload';
import { emitInvalidate } from '../realtime/socket';

export const meRouter = Router();

meRouter.use(requireAuth);

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface CompanyEntry {
  companyId: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  gradeId: number | null;
  gradeName: string | null;
  canManage: boolean;
}

meRouter.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const staff = await isStaff(userId);
    const effective = await getEffectiveModules();

    let entries: CompanyEntry[];
    if (staff) {
      const all = await db
        .select({
          companyId: companies.id,
          name: companies.name,
          slug: companies.slug,
          logoUrl: companies.logoUrl,
        })
        .from(companies)
        .where(isNull(companies.deletedAt))
        .orderBy(companies.name);
      entries = all.map((c) => ({ ...c, gradeId: null, gradeName: null, canManage: true }));
    } else {
      const rows = await db
        .select({
          companyId: companies.id,
          name: companies.name,
          slug: companies.slug,
          logoUrl: companies.logoUrl,
          gradeId: companyRoles.id,
          gradeName: companyRoles.name,
          canManage: companyRoles.canManage,
        })
        .from(memberships)
        .innerJoin(companies, eq(memberships.companyId, companies.id))
        .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.active, true),
            isNull(companies.deletedAt),
          ),
        );
      entries = rows.map((r) => ({ ...r, canManage: r.canManage ?? false }));
    }

    const result = [];
    for (const e of entries) {
      const cmods = await db
        .select()
        .from(companyModules)
        .where(eq(companyModules.companyId, e.companyId));
      const enabledMap = new Map(cmods.map((c) => [c.moduleKey, c.enabled]));
      const configMap = new Map(cmods.map((c) => [c.moduleKey, c.config]));
      const permMap = new Map<string, { canView: boolean; canWrite: boolean }>();
      if (!staff && e.gradeId) {
        const perms = await db
          .select()
          .from(rolePermissions)
          .where(eq(rolePermissions.companyRoleId, e.gradeId));
        for (const p of perms) permMap.set(p.moduleKey, { canView: p.canView, canWrite: p.canWrite });
      }

      const modules = effective.map((m) => {
        const p = permMap.get(m.key);
        return {
          key: m.key,
          label: m.label,
          group: m.group,
          enabled: enabledMap.get(m.key) ?? m.defaultEnabled,
          blocked: m.blocked,
          canView: staff ? true : (p?.canView ?? false),
          canWrite: staff ? true : (p?.canWrite ?? false),
          config: (configMap.get(m.key) as Record<string, unknown> | null) ?? {},
        };
      });

      result.push({
        company: { id: e.companyId, name: e.name, slug: e.slug, logoUrl: e.logoUrl },
        grade: e.gradeId ? { id: e.gradeId, name: e.gradeName } : null,
        canManage: e.canManage,
        modules,
      });
    }
    res.json(result);
  }),
);

meRouter.post(
  '/companies/:id/logo',
  companyLogoUpload.single('logo'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    if (!req.file) return res.status(400).json({ error: 'invalid_file' });
    if (!(await canManageCompany(req.user!.id, id))) return res.status(403).json({ error: 'forbidden' });
    await db.update(companies).set({ logoUrl: companyLogoUrl(req.file.filename) }).where(eq(companies.id, id));
    emitInvalidate(['irs', `company:${id}`], [['my-companies'], ['companies']]);
    res.json({ ok: true });
  }),
);

meRouter.put(
  '/companies/:id/modules/:key',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const key = req.params.key;
    if (!id || !key || !(MODULE_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, id))) return res.status(403).json({ error: 'forbidden' });
    const moduleKey = key as ModuleKey;
    if (await isModuleBlocked(moduleKey)) return res.status(409).json({ error: 'module_blocked' });
    await db
      .insert(companyModules)
      .values({ companyId: id, moduleKey, enabled: parsed.data.enabled })
      .onDuplicateKeyUpdate({ set: { enabled: parsed.data.enabled } });
    emitInvalidate(['irs', `company:${id}`], [
      ['my-companies'],
      ['company-modules', id],
      ['companies'],
    ]);
    res.json({ ok: true });
  }),
);

meRouter.put(
  '/companies/:id/modules/:key/config',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const key = req.params.key;
    if (!id || !key || !(MODULE_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    if (!(await canManageCompany(req.user!.id, id))) return res.status(403).json({ error: 'forbidden' });
    const moduleKey = key as ModuleKey;
    const fields = MODULE_CONFIG[moduleKey] ?? [];
    if (fields.length === 0) return res.status(400).json({ error: 'no_config' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const config: Record<string, boolean> = {};
    for (const f of fields) {
      config[f.key] = typeof body[f.key] === 'boolean' ? (body[f.key] as boolean) : f.default;
    }
    await db
      .insert(companyModules)
      .values({ companyId: id, moduleKey, config })
      .onDuplicateKeyUpdate({ set: { config } });
    emitInvalidate(['irs', `company:${id}`], [['my-companies'], ['companies']]);
    res.json({ ok: true });
  }),
);
