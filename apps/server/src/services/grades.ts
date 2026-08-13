import { asc, eq, inArray } from 'drizzle-orm';
import { MODULE_KEYS, MODULE_SPECIAL_ACTIONS, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { companyRoles, rolePermissions, roleSpecialPermissions } from '../db/schema';
import { getEffectiveModules } from './modules';

interface DefaultGrade {
  name: string;
  rank: number;
  canManage: boolean;
}

const DEFAULT_GRADES: DefaultGrade[] = [
  { name: 'Patron', rank: 0, canManage: true },
  { name: 'Co-patron', rank: 1, canManage: true },
  { name: 'Gérant', rank: 2, canManage: false },
  { name: 'Employé', rank: 3, canManage: false },
];

// Modules accessibles par défaut à un simple employé (en lecture seule).
// Tout le reste (RH, stats, dividendes, actionnaires, déclarations, exercices…)
// est masqué par défaut ; seul un grade « gérant » (canManage) voit/gère tout.
export const BASIC_MODULES: ModuleKey[] = ['caisse', 'garage', 'badgeuse'];

export function defaultModulePerms(canManage: boolean, key: ModuleKey) {
  if (canManage) {
    return { canView: true, canWrite: true, canCreate: true, canEdit: true, canDelete: true };
  }
  if (BASIC_MODULES.includes(key)) {
    return { canView: true, canWrite: false, canCreate: false, canEdit: false, canDelete: false };
  }
  return { canView: false, canWrite: false, canCreate: false, canEdit: false, canDelete: false };
}

export function defaultPermRows(companyRoleId: number, canManage: boolean) {
  return MODULE_KEYS.map((key) => ({
    companyRoleId,
    moduleKey: key,
    ...defaultModulePerms(canManage, key as ModuleKey),
  }));
}

export async function seedCompanyRoles(companyId: number): Promise<void> {
  for (const g of DEFAULT_GRADES) {
    const inserted = await db
      .insert(companyRoles)
      .values({ companyId, name: g.name, rank: g.rank, isDefault: true, canManage: g.canManage });
    const roleId = inserted[0].insertId;
    await db.insert(rolePermissions).values(defaultPermRows(roleId, g.canManage));
  }
}

export async function seedGradePermissions(companyRoleId: number, canManage: boolean): Promise<void> {
  await db.insert(rolePermissions).values(defaultPermRows(companyRoleId, canManage));
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
        nickname: g.nickname,
        fivemGrade: g.fivemGrade,
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
