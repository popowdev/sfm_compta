import { asc, eq, inArray } from 'drizzle-orm';
import { MODULE_KEYS, MODULE_SPECIAL_ACTIONS, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { companyRoles, rolePermissions, roleSpecialPermissions } from '../db/schema';
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
        canCreate: g.canWrite,
        canEdit: g.canWrite,
        canDelete: g.canWrite,
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
  const special = gradeIds.length
    ? await db
        .select()
        .from(roleSpecialPermissions)
        .where(inArray(roleSpecialPermissions.companyRoleId, gradeIds))
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
      const specialMap: Record<string, Record<string, boolean>> = {};
      for (const [key, actions] of Object.entries(MODULE_SPECIAL_ACTIONS)) {
        const actionMap: Record<string, boolean> = {};
        for (const a of actions ?? []) {
          const row = special.find(
            (x) => x.companyRoleId === g.id && x.moduleKey === key && x.actionKey === a.key,
          );
          actionMap[a.key] = g.canManage ? true : row?.granted ?? false;
        }
        specialMap[key] = actionMap;
      }
      return {
        id: g.id,
        name: g.name,
        rank: g.rank,
        isDefault: g.isDefault,
        canManage: g.canManage,
        permissions: map,
        special: specialMap,
      };
    }),
  };
}

export async function setRoleSpecialPermission(
  companyRoleId: number,
  moduleKey: ModuleKey,
  actionKey: string,
  granted: boolean,
): Promise<void> {
  await db
    .insert(roleSpecialPermissions)
    .values({ companyRoleId, moduleKey, actionKey, granted })
    .onDuplicateKeyUpdate({ set: { granted } });
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
