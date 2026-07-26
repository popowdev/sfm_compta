import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { notifications, memberships, companyRoles, userAppRoles } from '../db/schema';
import { emitInvalidate } from '../realtime/socket';

interface NotifInput {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

export async function notify(userIds: number[], n: NotifInput): Promise<void> {
  const ids = [...new Set(userIds)].filter((x) => x > 0);
  if (!ids.length) return;
  await db.insert(notifications).values(
    ids.map((userId) => ({
      userId,
      type: n.type,
      title: n.title.slice(0, 160),
      body: n.body ? n.body.slice(0, 300) : null,
      link: n.link ?? null,
    })),
  );
  emitInvalidate(
    ids.map((id) => `user:${id}`),
    [['notifications']],
  );
}

export async function companyManagerUserIds(companyId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(
      and(eq(memberships.companyId, companyId), eq(memberships.active, true), eq(companyRoles.canManage, true)),
    );
  return rows.map((r) => r.userId);
}

export async function allCompanyManagerUserIds(): Promise<number[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(companyRoles, eq(memberships.companyRoleId, companyRoles.id))
    .where(and(eq(memberships.active, true), eq(companyRoles.canManage, true)));
  return [...new Set(rows.map((r) => r.userId))];
}

export async function staffUserIds(): Promise<number[]> {
  const rows = await db
    .select({ userId: userAppRoles.userId })
    .from(userAppRoles)
    .where(eq(userAppRoles.role, 'staff'));
  return [...new Set(rows.map((r) => r.userId))];
}

export async function irsUserIds(): Promise<number[]> {
  const rows = await db
    .select({ userId: userAppRoles.userId })
    .from(userAppRoles)
    .where(inArray(userAppRoles.role, ['irs', 'staff']));
  return [...new Set(rows.map((r) => r.userId))];
}
