import { db } from '../db';
import { auditLog } from '../db/schema';

interface AuditInput {
  actorUserId: number | null;
  actorName: string;
  action: string;
  targetType: string;
  targetLabel?: string | null;
  detail?: string | null;
}

// Fire-and-forget audit trail for IRS/staff actions. Never throws into the request path.
export async function recordAudit(a: AuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorUserId: a.actorUserId,
      actorName: a.actorName.slice(0, 120),
      action: a.action.slice(0, 60),
      targetType: a.targetType.slice(0, 40),
      targetLabel: a.targetLabel ? a.targetLabel.slice(0, 200) : null,
      detail: a.detail ? a.detail.slice(0, 300) : null,
    });
  } catch {
    // auditing must never break the underlying action
  }
}
