import { and, eq } from 'drizzle-orm';
import { MODULES, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import {
  memberships,
  companyModules,
  rolePermissions,
  roleSpecialPermissions,
  companyRoles,
  userAppRoles,
  users,
} from '../db/schema';
import { isModuleBlocked } from './modules';

// Staff "omniscience" (voit toutes les entreprises, bypass des permissions) est
// débrayable par l'utilisateur via users.staff_mode. Le rôle staff lui-même
// (requireAppRole) n'est PAS affecté : couper le mode masque juste la vue globale.
export async function isStaff(userId: number): Promise<boolean> {
  const rows = await db
    .select({ role: userAppRoles.role, staffMode: users.staffMode })
    .from(users)
    .leftJoin(userAppRoles, eq(userAppRoles.userId, users.id))
    .where(eq(users.id, userId));
  if (!rows[0]?.staffMode) return false;
  return rows.some((r) => r.role === 'staff');
}

export async function canManageCompany(userId: number, companyId: number): Promise<boolean> {
  if (await isStaff(userId)) return true;
  const rows = await db
    .select({ canManage: companyRoles.canManage })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.companyId, companyId),
        eq(memberships.active, true),
      ),
    )
    .limit(1);
  return rows[0]?.canManage ?? false;
}

export async function countActiveManagerMemberships(
  companyId: number,
  opts: { excludeMembershipId?: number; excludeGradeId?: number } = {},
): Promise<number> {
  const rows = await db
    .select({ mid: memberships.id, gid: companyRoles.id })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(
      and(
        eq(memberships.companyId, companyId),
        eq(memberships.active, true),
        eq(companyRoles.canManage, true),
      ),
    );
  return rows.filter(
    (r) =>
      (opts.excludeMembershipId === undefined || r.mid !== opts.excludeMembershipId) &&
      (opts.excludeGradeId === undefined || r.gid !== opts.excludeGradeId),
  ).length;
}

export async function hasSpecialPermission(
  userId: number,
  companyId: number,
  moduleKey: ModuleKey,
  actionKey: string,
): Promise<boolean> {
  if (await isStaff(userId)) return true;
  const rows = await db
    .select({ canManage: companyRoles.canManage, granted: roleSpecialPermissions.granted })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .leftJoin(
      roleSpecialPermissions,
      and(
        eq(roleSpecialPermissions.companyRoleId, companyRoles.id),
        eq(roleSpecialPermissions.moduleKey, moduleKey),
        eq(roleSpecialPermissions.actionKey, actionKey),
      ),
    )
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.companyId, companyId),
        eq(memberships.active, true),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.canManage) return true;
  return row.granted ?? false;
}

export interface ModuleAccess {
  enabled: boolean;
  blocked: boolean;
  canView: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  gradeId: number | null;
}

export type PermAction = 'view' | 'create' | 'edit' | 'delete';

export function actionDenied(acc: ModuleAccess, action: PermAction): boolean {
  if (action === 'create') return !acc.canCreate;
  if (action === 'edit') return !acc.canEdit;
  if (action === 'delete') return !acc.canDelete;
  return false;
}

export async function getModuleAccess(
  userId: number,
  companyId: number,
  moduleKey: ModuleKey,
): Promise<ModuleAccess | null> {
  const cm = await db
    .select({ enabled: companyModules.enabled })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, moduleKey)))
    .limit(1);
  const defaultEnabled = MODULES.find((m) => m.key === moduleKey)?.defaultEnabled ?? false;
  const enabled = cm[0]?.enabled ?? defaultEnabled;
  const blocked = await isModuleBlocked(moduleKey);

  if (await isStaff(userId)) {
    return {
      enabled,
      blocked,
      canView: true,
      canWrite: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      gradeId: null,
    };
  }

  const mem = await db
    .select({ gradeId: memberships.companyRoleId, canManage: companyRoles.canManage })
    .from(memberships)
    .leftJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.companyId, companyId),
        eq(memberships.active, true),
      ),
    )
    .limit(1);
  if (!mem[0]) return null;

  // Un grade « gérant » (Patron / Co-patron) a accès complet à tous les modules,
  // sans dépendre des rolePermissions.
  if (mem[0].canManage) {
    return {
      enabled,
      blocked,
      canView: true,
      canWrite: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      gradeId: mem[0].gradeId,
    };
  }

  const gradeId = mem[0].gradeId;
  let canView = false;
  let canWrite = false;
  let canCreate = false;
  let canEdit = false;
  let canDelete = false;
  if (gradeId) {
    const p = await db
      .select()
      .from(rolePermissions)
      .where(and(eq(rolePermissions.companyRoleId, gradeId), eq(rolePermissions.moduleKey, moduleKey)))
      .limit(1);
    canView = p[0]?.canView ?? false;
    canWrite = p[0]?.canWrite ?? false;
    canCreate = p[0]?.canCreate ?? false;
    canEdit = p[0]?.canEdit ?? false;
    canDelete = p[0]?.canDelete ?? false;
  }

  return { enabled, blocked, canView, canWrite, canCreate, canEdit, canDelete, gradeId };
}
