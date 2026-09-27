import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, inArray, like, or, sql } from 'drizzle-orm';
import { TICKET_TYPE_KEYS, TICKET_PRIORITY_KEYS, TICKET_STATUS_KEYS } from '@rp-compta/shared';
import { db } from '../db';
import { tickets, ticketMessages, ticketAttachments, ticketEvents, ticketMessageReactions, users, companies, userAppRoles } from '../db/schema';
import { requireAuth, requireAppRole, requireDev } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { notify, staffUserIds } from '../services/notifications';
import { recordAudit } from '../services/audit';
import { ticketUpload, ticketFilePath } from '../services/upload';
import { notifyTicketCreated } from '../services/discordWebhook';
import { createTicketChannel, mirrorToDiscord, closeTicketBridge, type BridgeFile } from '../services/ticketBridge';
import { emitInvalidate } from '../realtime/socket';

const MAX_PER_HOUR = 5;

function parseId(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function generateRef(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const ref = randomBytes(2).toString('hex').toUpperCase();
    const clash = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.ref, ref)).limit(1);
    if (!clash[0]) return ref;
  }
  return randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
}

function ticketLink(ref: string): string {
  return `/support/${ref}`;
}

async function logTicketEvent(e: { ticketId: number; ref: string; type: string; actorUserId?: number | null; actorName?: string | null; detail?: string | null }): Promise<void> {
  try {
    await db.insert(ticketEvents).values({
      ticketId: e.ticketId,
      ref: e.ref,
      eventType: e.type.slice(0, 40),
      actorUserId: e.actorUserId ?? null,
      actorName: e.actorName ? e.actorName.slice(0, 120) : null,
      detail: e.detail ? e.detail.slice(0, 255) : null,
    });
  } catch {
    return;
  }
}

function bridgeFiles(files: unknown): BridgeFile[] {
  const list = Array.isArray(files) ? (files as Express.Multer.File[]) : [];
  return list.map((f) => ({ path: f.path, name: (f.originalname ?? f.filename ?? 'fichier').slice(0, 200) }));
}

async function saveAttachments(ticketId: number, messageId: number, files: unknown): Promise<void> {
  const list = Array.isArray(files) ? (files as Express.Multer.File[]) : [];
  if (!list.length) return;
  await db.insert(ticketAttachments).values(
    list.map((f) => ({
      ticketId,
      messageId,
      path: f.filename,
      originalName: (f.originalname ?? '').slice(0, 200) || null,
      size: f.size ?? 0,
    })),
  );
}

async function loadMessages(ticketId: number, includeInternal: boolean, viewerId: number) {
  const rows = await db
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      internal: ticketMessages.internal,
      createdAt: ticketMessages.createdAt,
      authorId: ticketMessages.userId,
      authorName: users.displayName,
      authorAvatar: users.avatarUrl,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(ticketMessages.userId, users.id))
    .where(
      includeInternal
        ? eq(ticketMessages.ticketId, ticketId)
        : and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.internal, false)),
    )
    .orderBy(ticketMessages.createdAt);

  const atts = await db
    .select({
      id: ticketAttachments.id,
      messageId: ticketAttachments.messageId,
      originalName: ticketAttachments.originalName,
    })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId));

  const reacts = await db
    .select({ id: ticketMessageReactions.id, messageId: ticketMessageReactions.messageId, emoji: ticketMessageReactions.emoji, userId: ticketMessageReactions.userId })
    .from(ticketMessageReactions)
    .where(eq(ticketMessageReactions.ticketId, ticketId))
    .orderBy(ticketMessageReactions.id);

  return rows.map((m) => {
    const mine = reacts.filter((r) => r.messageId === m.id);
    const grouped: { emoji: string; count: number; mine: boolean }[] = [];
    for (const r of mine) {
      const g = grouped.find((x) => x.emoji === r.emoji);
      if (g) { g.count += 1; if (r.userId === viewerId) g.mine = true; }
      else grouped.push({ emoji: r.emoji, count: 1, mine: r.userId === viewerId });
    }
    return {
      ...m,
      attachments: atts
        .filter((a) => a.messageId === m.id)
        .map((a) => ({ id: a.id, name: a.originalName, url: `/api/tickets/attachments/${a.id}` })),
      reactions: grouped,
    };
  });
}

const ticketColumns = {
  id: tickets.id,
  ref: tickets.ref,
  type: tickets.type,
  priority: tickets.priority,
  status: tickets.status,
  title: tickets.title,
  userId: tickets.userId,
  assignedUserId: tickets.assignedUserId,
  companyId: tickets.companyId,
  contextPath: tickets.contextPath,
  contextErrorCode: tickets.contextErrorCode,
  contextAgent: tickets.contextAgent,
  lastMessageAt: tickets.lastMessageAt,
  createdAt: tickets.createdAt,
  resolvedAt: tickets.resolvedAt,
  closedAt: tickets.closedAt,
};

const reactionSchema = z.object({ emoji: z.string().trim().min(1).max(32) });

async function messageInTicket(ticketId: number, messageId: number, allowInternal: boolean) {
  const rows = await db
    .select({ id: ticketMessages.id, internal: ticketMessages.internal })
    .from(ticketMessages)
    .where(and(eq(ticketMessages.id, messageId), eq(ticketMessages.ticketId, ticketId)))
    .limit(1);
  const m = rows[0];
  if (!m) return false;
  if (!allowInternal && m.internal) return false;
  return true;
}

async function toggleReaction(ticketId: number, messageId: number, userId: number, emoji: string) {
  const existing = await db
    .select({ id: ticketMessageReactions.id })
    .from(ticketMessageReactions)
    .where(and(eq(ticketMessageReactions.messageId, messageId), eq(ticketMessageReactions.userId, userId), eq(ticketMessageReactions.emoji, emoji)))
    .limit(1);
  if (existing[0]) {
    await db.delete(ticketMessageReactions).where(eq(ticketMessageReactions.id, existing[0].id));
    return 'removed' as const;
  }
  await db.insert(ticketMessageReactions).values({ ticketId, messageId, userId, emoji });
  return 'added' as const;
}

export const meTicketsRouter = Router();
meTicketsRouter.use(requireAuth);

meTicketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select(ticketColumns)
      .from(tickets)
      .where(eq(tickets.userId, req.user!.id))
      .orderBy(desc(sql`COALESCE(${tickets.lastMessageAt}, ${tickets.createdAt})`))
      .limit(200);
    res.json(rows);
  }),
);

const createSchema = z.object({
  type: z.enum(TICKET_TYPE_KEYS as [string, ...string[]]),
  priority: z.enum(TICKET_PRIORITY_KEYS as [string, ...string[]]),
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(5).max(5000),
  companyId: z.coerce.number().int().positive().nullish(),
  contextPath: z.string().trim().max(255).nullish(),
  contextErrorCode: z.string().trim().max(16).nullish(),
});

meTicketsRouter.post(
  '/',
  ticketUpload.array('files', 3),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    const recent = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(tickets)
      .where(
        and(eq(tickets.userId, req.user!.id), gt(tickets.createdAt, sql`DATE_SUB(NOW(), INTERVAL 1 HOUR)`)),
      );
    if (Number(recent[0]?.n ?? 0) >= MAX_PER_HOUR) {
      return res.status(429).json({ error: 'too_many_tickets' });
    }

    const ref = await generateRef();
    const inserted = await db.insert(tickets).values({
      ref,
      type: parsed.data.type as 'bug',
      priority: parsed.data.priority as 'normal',
      title: parsed.data.title,
      userId: req.user!.id,
      companyId: parsed.data.companyId ?? null,
      contextPath: parsed.data.contextPath ?? null,
      contextErrorCode: parsed.data.contextErrorCode ?? null,
      contextAgent: (req.get('user-agent') ?? '').slice(0, 255) || null,
      lastMessageAt: sql`CURRENT_TIMESTAMP`,
    });
    const ticketId = inserted[0].insertId;
    const firstMsg = await db
      .insert(ticketMessages)
      .values({ ticketId, userId: req.user!.id, body: parsed.data.body });
    await saveAttachments(ticketId, firstMsg[0].insertId, req.files);
    await logTicketEvent({ ticketId: Number(ticketId), ref, type: 'created', actorUserId: req.user!.id, actorName: req.user!.displayName, detail: `${parsed.data.type} · ${parsed.data.priority} · ${parsed.data.title}` });

    const staff = await staffUserIds();
    await notify(staff, {
      type: 'ticket',
      title: `Nouveau ticket #${ref}`,
      body: parsed.data.title,
      link: ticketLink(ref),
    });
    emitInvalidate(['staff', 'irs'], [['support-tickets']]);
    emitInvalidate([`user:${req.user!.id}`], [['my-tickets']]);

    void notifyTicketCreated({
      ref,
      type: parsed.data.type,
      priority: parsed.data.priority,
      title: parsed.data.title,
      body: parsed.data.body,
      authorName: req.user!.displayName,
      authorAvatar: req.user!.avatarUrl,
      contextPath: parsed.data.contextPath,
      contextErrorCode: parsed.data.contextErrorCode,
      attachmentCount: Array.isArray(req.files) ? req.files.length : 0,
    });

    void createTicketChannel({
      id: Number(ticketId),
      ref,
      type: parsed.data.type,
      title: parsed.data.title,
      authorName: req.user!.displayName,
      body: parsed.data.body,
      files: bridgeFiles(req.files),
    });

    res.status(201).json({ ok: true, ref });
  }),
);

async function findOwnTicket(ref: string, userId: number) {
  const rows = await db
    .select(ticketColumns)
    .from(tickets)
    .where(and(eq(tickets.ref, ref), eq(tickets.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

meTicketsRouter.get(
  '/:ref',
  asyncHandler(async (req, res) => {
    const t = await findOwnTicket(String(req.params.ref ?? ''), req.user!.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    const messages = await loadMessages(t.id, false, req.user!.id);
    res.json({ ticket: t, messages });
  }),
);

const replySchema = z.object({ body: z.string().trim().min(1).max(5000) });

meTicketsRouter.post(
  '/:ref/messages',
  ticketUpload.array('files', 3),
  asyncHandler(async (req, res) => {
    const t = await findOwnTicket(String(req.params.ref ?? ''), req.user!.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.status === 'closed') return res.status(409).json({ error: 'ticket_closed' });
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    const msg = await db
      .insert(ticketMessages)
      .values({ ticketId: t.id, userId: req.user!.id, body: parsed.data.body });
    await saveAttachments(t.id, msg[0].insertId, req.files);
    await db
      .update(tickets)
      .set({ lastMessageAt: sql`CURRENT_TIMESTAMP`, status: 'waiting_staff', resolvedAt: null })
      .where(eq(tickets.id, t.id));
    await logTicketEvent({ ticketId: t.id, ref: t.ref, type: 'member_reply', actorUserId: req.user!.id, actorName: req.user!.displayName });

    const targets = t.assignedUserId ? [t.assignedUserId] : await staffUserIds();
    await notify(targets, {
      type: 'ticket',
      title: `Réponse sur #${t.ref}`,
      body: t.title,
      link: ticketLink(t.ref),
    });
    emitInvalidate(['staff', 'irs'], [['support-tickets'], ['support-ticket', t.ref]]);
    emitInvalidate([`user:${req.user!.id}`], [['my-tickets'], ['my-ticket', t.ref]]);
    void mirrorToDiscord(t.id, req.user!.displayName, parsed.data.body, false, bridgeFiles(req.files));
    res.status(201).json({ ok: true });
  }),
);

meTicketsRouter.post(
  '/:ref/close',
  asyncHandler(async (req, res) => {
    const t = await findOwnTicket(String(req.params.ref ?? ''), req.user!.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.status === 'closed') return res.json({ ok: true });
    await db
      .update(tickets)
      .set({ status: 'closed', closedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(tickets.id, t.id));
    await logTicketEvent({ ticketId: t.id, ref: t.ref, type: 'closed', actorUserId: req.user!.id, actorName: req.user!.displayName, detail: 'fermé par le joueur' });
    emitInvalidate(['staff', 'irs'], [['support-tickets'], ['support-ticket', t.ref]]);
    emitInvalidate([`user:${req.user!.id}`], [['my-tickets'], ['my-ticket', t.ref]]);
    void closeTicketBridge({ id: t.id, ref: t.ref }, req.user!.displayName);
    res.json({ ok: true });
  }),
);

meTicketsRouter.post(
  '/:ref/messages/:messageId/reactions',
  asyncHandler(async (req, res) => {
    const t = await findOwnTicket(String(req.params.ref ?? ''), req.user!.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.status === 'closed') return res.status(409).json({ error: 'ticket_closed' });
    const messageId = parseId(req.params.messageId);
    if (!messageId) return res.status(400).json({ error: 'bad_request' });
    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await messageInTicket(t.id, messageId, false))) return res.status(404).json({ error: 'not_found' });
    await toggleReaction(t.id, messageId, req.user!.id, parsed.data.emoji);
    emitInvalidate(['staff', 'irs'], [['support-ticket', t.ref]]);
    emitInvalidate([`user:${req.user!.id}`], [['my-ticket', t.ref]]);
    res.json({ ok: true });
  }),
);

export const ticketFilesRouter = Router();
ticketFilesRouter.use(requireAuth);

ticketFilesRouter.get(
  '/attachments/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_request' });
    const rows = await db
      .select({ path: ticketAttachments.path, owner: tickets.userId })
      .from(ticketAttachments)
      .innerJoin(tickets, eq(tickets.id, ticketAttachments.ticketId))
      .where(eq(ticketAttachments.id, id))
      .limit(1);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'not_found' });

    if (a.owner !== req.user!.id) {
      const staff = await db
        .select({ role: userAppRoles.role })
        .from(userAppRoles)
        .where(and(eq(userAppRoles.userId, req.user!.id), eq(userAppRoles.role, 'staff')))
        .limit(1);
      if (!staff[0]) return res.status(403).json({ error: 'forbidden' });
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.sendFile(ticketFilePath(a.path));
  }),
);

export const supportTicketsRouter = Router();
supportTicketsRouter.use(requireAuth, requireAppRole('staff'));

const listQuery = z.object({
  status: z.enum(TICKET_STATUS_KEYS as [string, ...string[]]).optional(),
  priority: z.enum(TICKET_PRIORITY_KEYS as [string, ...string[]]).optional(),
  type: z.enum(TICKET_TYPE_KEYS as [string, ...string[]]).optional(),
  mine: z.coerce.boolean().optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

supportTicketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const { status, priority, type, mine, q, page, limit } = parsed.data;

    const filters = [
      status ? eq(tickets.status, status as 'waiting_staff') : undefined,
      priority ? eq(tickets.priority, priority as 'normal') : undefined,
      type ? eq(tickets.type, type as 'bug') : undefined,
      mine ? eq(tickets.assignedUserId, req.user!.id) : undefined,
      q ? or(like(tickets.title, `%${q}%`), like(tickets.ref, `%${q}%`)) : undefined,
    ].filter(Boolean);
    const where = filters.length ? and(...(filters as [])) : undefined;

    const [countRows, rows, openRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(tickets).where(where),
      db
        .select({
          ...ticketColumns,
          authorName: users.displayName,
          companyName: companies.name,
        })
        .from(tickets)
        .leftJoin(users, eq(tickets.userId, users.id))
        .leftJoin(companies, eq(tickets.companyId, companies.id))
        .where(where)
        .orderBy(
          sql`FIELD(${tickets.status}, 'waiting_staff', 'waiting_user', 'resolved', 'closed')`,
          sql`FIELD(${tickets.priority}, 'high', 'normal', 'low')`,
          desc(sql`COALESCE(${tickets.lastMessageAt}, ${tickets.createdAt})`),
        )
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(tickets)
        .where(inArray(tickets.status, ['waiting_staff', 'waiting_user'])),
    ]);

    res.json({
      tickets: rows,
      total: Number(countRows[0]?.n ?? 0),
      open: Number(openRows[0]?.n ?? 0),
      page,
      limit,
    });
  }),
);

supportTicketsRouter.get(
  '/:ref',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({ ...ticketColumns, authorName: users.displayName, companyName: companies.name })
      .from(tickets)
      .leftJoin(users, eq(tickets.userId, users.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(eq(tickets.ref, String(req.params.ref ?? '')))
      .limit(1);
    const t = rows[0];
    if (!t) return res.status(404).json({ error: 'not_found' });
    const messages = await loadMessages(t.id, true, req.user!.id);
    res.json({ ticket: t, messages });
  }),
);

const staffReplySchema = z.object({
  body: z.string().trim().min(1).max(5000),
  internal: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .default(false)
    .transform((v) => v === true || v === 'true'),
});

supportTicketsRouter.post(
  '/:ref/messages',
  ticketUpload.array('files', 3),
  asyncHandler(async (req, res) => {
    const rows = await db.select(ticketColumns).from(tickets).where(eq(tickets.ref, String(req.params.ref ?? ''))).limit(1);
    const t = rows[0];
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.status === 'closed') return res.status(409).json({ error: 'ticket_closed' });
    const parsed = staffReplySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    const staffMsg = await db.insert(ticketMessages).values({
      ticketId: t.id,
      userId: req.user!.id,
      body: parsed.data.body,
      internal: parsed.data.internal,
    });
    await saveAttachments(t.id, staffMsg[0].insertId, req.files);
    await db
      .update(tickets)
      .set({
        lastMessageAt: sql`CURRENT_TIMESTAMP`,
        status: parsed.data.internal ? t.status : 'waiting_user',
        resolvedAt: parsed.data.internal ? t.resolvedAt : null,
        assignedUserId: t.assignedUserId ?? req.user!.id,
      })
      .where(eq(tickets.id, t.id));
    await logTicketEvent({ ticketId: t.id, ref: t.ref, type: parsed.data.internal ? 'staff_note' : 'staff_reply', actorUserId: req.user!.id, actorName: req.user!.displayName, detail: parsed.data.internal ? 'note interne' : null });

    if (!parsed.data.internal) {
      await notify([t.userId], {
        type: 'ticket',
        title: `Réponse du staff sur #${t.ref}`,
        body: t.title,
        link: ticketLink(t.ref),
      });
      emitInvalidate([`user:${t.userId}`], [['my-tickets'], ['my-ticket', t.ref]]);
    }
    emitInvalidate(['staff', 'irs'], [['support-tickets'], ['support-ticket', t.ref]]);
    void mirrorToDiscord(t.id, req.user!.displayName, parsed.data.body, parsed.data.internal, bridgeFiles(req.files));
    res.status(201).json({ ok: true });
  }),
);

supportTicketsRouter.post(
  '/:ref/messages/:messageId/reactions',
  asyncHandler(async (req, res) => {
    const rows = await db.select(ticketColumns).from(tickets).where(eq(tickets.ref, String(req.params.ref ?? ''))).limit(1);
    const t = rows[0];
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.status === 'closed') return res.status(409).json({ error: 'ticket_closed' });
    const messageId = parseId(req.params.messageId);
    if (!messageId) return res.status(400).json({ error: 'bad_request' });
    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    if (!(await messageInTicket(t.id, messageId, true))) return res.status(404).json({ error: 'not_found' });
    await toggleReaction(t.id, messageId, req.user!.id, parsed.data.emoji);
    emitInvalidate(['staff', 'irs'], [['support-ticket', t.ref]]);
    emitInvalidate([`user:${t.userId}`], [['my-ticket', t.ref]]);
    res.json({ ok: true });
  }),
);

const patchSchema = z.object({
  status: z.enum(TICKET_STATUS_KEYS as [string, ...string[]]).optional(),
  priority: z.enum(TICKET_PRIORITY_KEYS as [string, ...string[]]).optional(),
  assignToMe: z.boolean().optional(),
  unassign: z.boolean().optional(),
});

supportTicketsRouter.patch(
  '/:ref',
  asyncHandler(async (req, res) => {
    const rows = await db.select(ticketColumns).from(tickets).where(eq(tickets.ref, String(req.params.ref ?? ''))).limit(1);
    const t = rows[0];
    if (!t) return res.status(404).json({ error: 'not_found' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const d = parsed.data;

    const patch: Record<string, unknown> = {};
    if (d.status) {
      patch.status = d.status;
      patch.resolvedAt = d.status === 'resolved' ? sql`CURRENT_TIMESTAMP` : null;
      patch.closedAt = d.status === 'closed' ? sql`CURRENT_TIMESTAMP` : null;
    }
    if (d.priority) patch.priority = d.priority;
    if (d.assignToMe) patch.assignedUserId = req.user!.id;
    if (d.unassign) patch.assignedUserId = null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'bad_request' });

    await db.update(tickets).set(patch).where(eq(tickets.id, t.id));
    await recordAudit({
      actorUserId: req.user!.id,
      actorName: req.user!.displayName,
      action: 'ticket_update',
      targetType: 'ticket',
      targetLabel: `#${t.ref}`,
      detail: Object.keys(patch).join(', '),
    });

    const actor = { actorUserId: req.user!.id, actorName: req.user!.displayName };
    if (d.status && d.status !== t.status) await logTicketEvent({ ticketId: t.id, ref: t.ref, type: 'status_change', ...actor, detail: `${t.status} → ${d.status}` });
    if (d.priority && d.priority !== t.priority) await logTicketEvent({ ticketId: t.id, ref: t.ref, type: 'priority_change', ...actor, detail: `${t.priority} → ${d.priority}` });
    if (d.assignToMe) await logTicketEvent({ ticketId: t.id, ref: t.ref, type: 'assigned', ...actor, detail: `assigné à ${req.user!.displayName}` });
    if (d.unassign) await logTicketEvent({ ticketId: t.id, ref: t.ref, type: 'unassigned', ...actor });

    if (d.status && d.status !== t.status) {
      await notify([t.userId], {
        type: 'ticket',
        title: `Ticket #${t.ref} mis à jour`,
        body: t.title,
        link: ticketLink(t.ref),
      });
      emitInvalidate([`user:${t.userId}`], [['my-tickets'], ['my-ticket', t.ref]]);
    }
    if (d.status === 'closed' && t.status !== 'closed') {
      void closeTicketBridge({ id: t.id, ref: t.ref }, req.user!.displayName);
    }
    emitInvalidate(['staff', 'irs'], [['support-tickets'], ['support-ticket', t.ref]]);
    res.json({ ok: true });
  }),
);

export const devTicketLogsRouter = Router();
devTicketLogsRouter.use(requireAuth, requireDev);

const logsQuery = z.object({
  ref: z.string().trim().max(16).optional(),
  type: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

devTicketLogsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = logsQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const { ref, type, page, limit } = parsed.data;
    const filters = [
      ref ? like(ticketEvents.ref, `%${ref.toUpperCase()}%`) : undefined,
      type ? eq(ticketEvents.eventType, type) : undefined,
    ].filter(Boolean);
    const where = filters.length ? and(...(filters as [])) : undefined;

    const [countRows, rows, typeRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(ticketEvents).where(where),
      db
        .select({
          id: ticketEvents.id,
          ref: ticketEvents.ref,
          eventType: ticketEvents.eventType,
          actorName: ticketEvents.actorName,
          detail: ticketEvents.detail,
          createdAt: ticketEvents.createdAt,
          ticketTitle: tickets.title,
          ticketStatus: tickets.status,
        })
        .from(ticketEvents)
        .leftJoin(tickets, eq(ticketEvents.ticketId, tickets.id))
        .where(where)
        .orderBy(desc(ticketEvents.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ t: ticketEvents.eventType, n: sql<number>`COUNT(*)` }).from(ticketEvents).groupBy(ticketEvents.eventType),
    ]);

    res.json({
      events: rows,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      types: typeRows.map((r) => ({ type: r.t, count: Number(r.n) })),
    });
  }),
);
