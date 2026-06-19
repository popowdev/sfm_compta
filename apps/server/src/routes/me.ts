import { Router } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  memberships,
  companies,
  companyRoles,
  companyModules,
  rolePermissions,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getEffectiveModules } from '../services/modules';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const rows = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        slug: companies.slug,
        logoUrl: companies.logoUrl,
        gradeId: companyRoles.id,
        gradeName: companyRoles.name,
      })
      .from(memberships)
      .innerJoin(companies, eq(memberships.companyId, companies.id))
      .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
      .where(
        and(eq(memberships.userId, userId), eq(memberships.active, true), isNull(companies.deletedAt)),
      );

    const effective = await getEffectiveModules();
    const result = [];
    for (const r of rows) {
      const cmods = await db
        .select()
        .from(companyModules)
        .where(eq(companyModules.companyId, r.companyId));
      const enabledMap = new Map(cmods.map((c) => [c.moduleKey, c.enabled]));
      const perms = r.gradeId
        ? await db.select().from(rolePermissions).where(eq(rolePermissions.companyRoleId, r.gradeId))
        : [];
      const permMap = new Map(perms.map((p) => [p.moduleKey, p]));

      const modules = effective.map((m) => {
        const p = permMap.get(m.key);
        return {
          key: m.key,
          label: m.label,
          group: m.group,
          enabled: enabledMap.get(m.key) ?? m.defaultEnabled,
          blocked: m.blocked,
          canView: p?.canView ?? false,
          canWrite: p?.canWrite ?? false,
        };
      });

      result.push({
        company: { id: r.companyId, name: r.companyName, slug: r.slug, logoUrl: r.logoUrl },
        grade: r.gradeId ? { id: r.gradeId, name: r.gradeName } : null,
        modules,
      });
    }
    res.json(result);
  }),
);
