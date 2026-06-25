import { and, eq } from 'drizzle-orm';
import type { AssociationMemberRole } from '@rp-compta/shared';
import { db } from '../db';
import { associations, associationMembers } from '../db/schema';
import { isStaff } from './access';

export function slugifyAssociation(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base || 'association';
}

export async function uniqueAssociationSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  for (;;) {
    const existing = await db
      .select({ id: associations.id })
      .from(associations)
      .where(eq(associations.slug, slug))
      .limit(1);
    if (!existing[0]) return slug;
    slug = `${base}-${i++}`;
  }
}

export interface AssociationAccess {
  isStaff: boolean;
  role: AssociationMemberRole | null;
  canView: boolean;
  canManageMembers: boolean;
  canManageTreasury: boolean;
  canManageSettings: boolean;
}

export async function getAssociationAccess(
  userId: number,
  associationId: number,
): Promise<AssociationAccess | null> {
  if (await isStaff(userId)) {
    return {
      isStaff: true,
      role: null,
      canView: true,
      canManageMembers: true,
      canManageTreasury: true,
      canManageSettings: true,
    };
  }
  const mem = await db
    .select({ role: associationMembers.role })
    .from(associationMembers)
    .where(
      and(
        eq(associationMembers.userId, userId),
        eq(associationMembers.associationId, associationId),
        eq(associationMembers.active, true),
      ),
    )
    .limit(1);
  if (!mem[0]) return null;
  const role = mem[0].role;
  const isPresident = role === 'president';
  const isBureau = role === 'president' || role === 'tresorier';
  return {
    isStaff: false,
    role,
    canView: true,
    canManageMembers: isPresident,
    canManageTreasury: isBureau,
    canManageSettings: isPresident,
  };
}
