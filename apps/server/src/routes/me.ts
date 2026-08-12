import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import {
  MODULE_KEYS,
  MODULE_CONFIG,
  MODULE_SPECIAL_ACTIONS,
  MODULES,
  type ModuleKey,
} from '@rp-compta/shared';
import { db } from '../db';
import {
  memberships,
  companies,
  companyRoles,
  companyModules,
  rolePermissions,
  roleSpecialPermissions,
  users,
  fivemPlayers,
  fivemCharacters,
} from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getEffectiveModules, isModuleBlocked } from '../services/modules';
import { isStaff, canManageCompany } from '../services/access';
import { companyLogoUpload, companyLogoUrl } from '../services/upload';
import { emitInvalidate } from '../realtime/socket';

export const meRouter = Router();

meRouter.use(requireAuth);

const staffModeSchema = z.object({ enabled: z.boolean() });

meRouter.put(
  '/staff-mode',
  requireAppRole('staff'),
  asyncHandler(async (req, res) => {
    const parsed = staffModeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await db.update(users).set({ staffMode: parsed.data.enabled }).where(eq(users.id, req.user!.id));
    emitInvalidate(`user:${req.user!.id}`, [['my-companies'], ['me']]);
    res.json({ ok: true, staffMode: parsed.data.enabled });
  }),
);

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface CompanyEntry {
  companyId: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  menuLayout: unknown;
  gradeId: number | null;
  gradeName: string | null;
  canManage: boolean;
  fivemJob: string | null;
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
          menuLayout: companies.menuLayout,
        })
        .from(companies)
        .where(isNull(companies.deletedAt))
        .orderBy(companies.name);
      entries = all.map((c) => ({ ...c, gradeId: null, gradeName: null, canManage: true, fivemJob: null }));
    } else {
      const rows = await db
        .select({
          companyId: companies.id,
          name: companies.name,
          slug: companies.slug,
          logoUrl: companies.logoUrl,
          menuLayout: companies.menuLayout,
          gradeId: companyRoles.id,
          gradeName: companyRoles.name,
          canManage: companyRoles.canManage,
          fivemJob: companies.fivemJob,
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

    // Perso sélectionné (affichage) → son job décide quelle entreprise FiveM est "active".
    let selectedJob: string | null = null;
    if (!staff) {
      const sel = await db
        .select({ job: fivemCharacters.jobId })
        .from(fivemPlayers)
        .innerJoin(
          fivemCharacters,
          and(
            eq(fivemCharacters.discordId, fivemPlayers.discordId),
            eq(fivemCharacters.name, fivemPlayers.selectedChar),
          ),
        )
        .where(eq(fivemPlayers.discordId, req.user!.discordId))
        .limit(1);
      selectedJob = sel[0]?.job ?? null;
    }

    const result = [];
    for (const e of entries) {
      const cmods = await db
        .select()
        .from(companyModules)
        .where(eq(companyModules.companyId, e.companyId));
      const enabledMap = new Map(cmods.map((c) => [c.moduleKey, c.enabled]));
      const configMap = new Map(cmods.map((c) => [c.moduleKey, c.config]));
      const permMap = new Map<
        string,
        { canView: boolean; canWrite: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }
      >();
      if (!staff && e.gradeId) {
        const perms = await db
          .select()
          .from(rolePermissions)
          .where(eq(rolePermissions.companyRoleId, e.gradeId));
        for (const p of perms)
          permMap.set(p.moduleKey, {
            canView: p.canView,
            canWrite: p.canWrite,
            canCreate: p.canCreate,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
          });
      }
      const specialMap = new Map<string, boolean>();
      if (!staff && !e.canManage && e.gradeId) {
        const sp = await db
          .select()
          .from(roleSpecialPermissions)
          .where(eq(roleSpecialPermissions.companyRoleId, e.gradeId));
        for (const s of sp) specialMap.set(`${s.moduleKey}.${s.actionKey}`, s.granted);
      }

      const modules = effective.map((m) => {
        const p = permMap.get(m.key);
        const special: Record<string, boolean> = {};
        for (const a of MODULE_SPECIAL_ACTIONS[m.key] ?? []) {
          special[a.key] =
            staff || e.canManage ? true : specialMap.get(`${m.key}.${a.key}`) ?? false;
        }
        return {
          key: m.key,
          label: m.label,
          group: m.group,
          enabled: enabledMap.get(m.key) ?? m.defaultEnabled,
          blocked: m.blocked,
          canView: staff || e.canManage ? true : (p?.canView ?? false),
          canWrite: staff || e.canManage ? true : (p?.canWrite ?? false),
          canCreate: staff || e.canManage ? true : (p?.canCreate ?? false),
          canEdit: staff || e.canManage ? true : (p?.canEdit ?? false),
          canDelete: staff || e.canManage ? true : (p?.canDelete ?? false),
          special,
          config: (configMap.get(m.key) as Record<string, unknown> | null) ?? {},
        };
      });

      const menuLayout = ((): unknown => {
        const v = e.menuLayout;
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
        return v ?? null;
      })();
      result.push({
        company: { id: e.companyId, name: e.name, slug: e.slug, logoUrl: e.logoUrl, menuLayout },
        grade: e.gradeId ? { id: e.gradeId, name: e.gradeName } : null,
        canManage: e.canManage,
        fivemActive: staff || !selectedJob || e.fivemJob === null || e.fivemJob === selectedJob,
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
    const staffOnly = MODULES.find((m) => m.key === moduleKey)?.staffOnly ?? false;
    if (staffOnly && !(await isStaff(req.user!.id))) return res.status(403).json({ error: 'staff_only_module' });
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
    if (await isModuleBlocked(moduleKey)) return res.status(409).json({ error: 'module_blocked' });
    const fields = MODULE_CONFIG[moduleKey] ?? [];
    if (fields.length === 0) return res.status(400).json({ error: 'no_config' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const config: Record<string, boolean | number> = {};
    for (const f of fields) {
      if (f.type === 'number') {
        const raw = body[f.key];
        let n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        if (!Number.isFinite(n)) n = f.default;
        if (f.min !== undefined) n = Math.max(f.min, n);
        if (f.max !== undefined) n = Math.min(f.max, n);
        config[f.key] = n;
      } else {
        config[f.key] = typeof body[f.key] === 'boolean' ? (body[f.key] as boolean) : f.default;
      }
    }
    const defaultEnabled = MODULES.find((m) => m.key === moduleKey)?.defaultEnabled ?? false;
    await db
      .insert(companyModules)
      .values({ companyId: id, moduleKey, enabled: defaultEnabled, config })
      .onDuplicateKeyUpdate({ set: { config } });
    emitInvalidate(['irs', `company:${id}`], [['my-companies'], ['companies']]);
    res.json({ ok: true });
  }),
);

const menuLayoutSchema = z.object({
  categories: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(40) })).max(30),
  items: z.array(z.object({ key: z.string().min(1).max(40), categoryId: z.union([z.string().max(40), z.null()]) })).max(120),
});

meRouter.put(
  '/companies/:id/menu-layout',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    if (!(await canManageCompany(req.user!.id, id))) return res.status(403).json({ error: 'forbidden' });
    const p = menuLayoutSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad_request' });
    await db.update(companies).set({ menuLayout: p.data }).where(eq(companies.id, id));
    emitInvalidate(['irs', `company:${id}`], [['my-companies']]);
    res.json({ ok: true });
  }),
);
