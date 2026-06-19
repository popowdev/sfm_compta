import { and, eq } from 'drizzle-orm';
import type { ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { memberships, companyModules, rolePermissions } from '../db/schema';
import { isModuleBlocked } from './modules';

export interface ModuleAccess {
  enabled: boolean;
  blocked: boolean;
  canView: boolean;
  canWrite: boolean;
  gradeId: number | null;
}

export async function getModuleAccess(
  userId: number,
  companyId: number,
  moduleKey: ModuleKey,
): Promise<ModuleAccess | null> {
  const mem = await db
    .select({ gradeId: memberships.companyRoleId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.companyId, companyId),
        eq(memberships.active, true),
      ),
    )
    .limit(1);
  if (!mem[0]) return null;

  const gradeId = mem[0].gradeId;
  const cm = await db
    .select({ enabled: companyModules.enabled })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, moduleKey)))
    .limit(1);
  const enabled = cm[0]?.enabled ?? false;
  const blocked = await isModuleBlocked(moduleKey);

  let canView = false;
  let canWrite = false;
  if (gradeId) {
    const p = await db
      .select()
      .from(rolePermissions)
      .where(and(eq(rolePermissions.companyRoleId, gradeId), eq(rolePermissions.moduleKey, moduleKey)))
      .limit(1);
    canView = p[0]?.canView ?? false;
    canWrite = p[0]?.canWrite ?? false;
  }

  return { enabled, blocked, canView, canWrite, gradeId };
}
