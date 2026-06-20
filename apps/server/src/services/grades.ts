import { asc, eq, inArray } from 'drizzle-orm';
import { MODULE_KEYS, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { companyRoles, rolePermissions } from '../db/schema';
import { getEffectiveModules } from './modules';

interface DefaultGrade {
  name: string;
  rank: number;
  canView: boolean;
  canWrite: boolean;
  canManage: boolean;
}

const DEFAULT_GRADES: DefaultGrade[] = [
  { name: 'Patron', rank: 0, canView: true, canWrite: true, canManage: true },
  { name: 'Co-patron', rank: 1, canView: true, canWrite: true, canManage: true },
  { name: 'Gérant', rank: 2, canView: true, canWrite: false, canManage: false },
  { name: 'Employé', rank: 3, canView: true, canWrite: false, canManage: false },
];

export async function seedCompanyRoles(companyId: number): Promise<void> {
  for (const g of DEFAULT_GRADES) {
    const inserted = await db
      .insert(companyRoles)
      .values({ companyId, name: g.name, rank: g.rank, isDefault: true, canManage: g.canManage });
    const roleId = inserted[0].insertId;
    await db.insert(rolePermissions).values(
      MODULE_KEYS.map((key) => ({
        companyRoleId: roleId,
        moduleKey: key,
        canView: g.canView,
        canWrite: g.canWrite,
      })),
    );
  }
}

export async function ensureCompanyRoles(companyId: number): Promise<void> {
  const existing = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(eq(companyRoles.companyId, companyId))
    .limit(1);
  if (!existing[0]) await seedCompanyRoles(companyId);
}

export async function getGradesWithPermissions(companyId: number) {
  await ensureCompanyRoles(companyId);
  const grades = await db
    .select()
    .from(companyRoles)
    .where(eq(companyRoles.companyId, companyId))
    .orderBy(asc(companyRoles.rank));
  const gradeIds = grades.map((g) => g.id);
  const perms = gradeIds.length
    ? await db.select().from(rolePermissions).where(inArray(rolePermissions.companyRoleId, gradeIds))
    : [];
  const effective = await getEffectiveModules();

  return {
    modules: effective.map((m) => ({ key: m.key, label: m.label, group: m.group })),
    grades: grades.map((g) => {
      const map: Record<
        string,
        { canView: boolean; canWrite: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }
      > = {};
      for (const m of effective) {
        const p = perms.find((x) => x.companyRoleId === g.id && x.moduleKey === m.key);
        const canCreate = p?.canCreate ?? false;
        const canEdit = p?.canEdit ?? false;
        const canDelete = p?.canDelete ?? false;
        map[m.key] = {
          canView: p?.canView ?? false,
          canWrite: canCreate || canEdit || canDelete,
          canCreate,
          canEdit,
          canDelete,
        };
      }
      return {
        id: g.id,
        name: g.name,
        rank: g.rank,
        isDefault: g.isDefault,
        canManage: g.canManage,
        permissions: map,
      };
    }),
  };
}

export async function setRolePermission(
  companyRoleId: number,
  moduleKey: ModuleKey,
  perms: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean },
): Promise<void> {
  const canWrite = perms.canCreate || perms.canEdit || perms.canDelete;
  const values = { ...perms, canWrite };
  await db
    .insert(rolePermissions)
    .values({ companyRoleId, moduleKey, ...values })
    .onDuplicateKeyUpdate({ set: values });
}
