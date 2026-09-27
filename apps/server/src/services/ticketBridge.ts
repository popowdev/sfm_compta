import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { tickets, ticketMessages, ticketEvents, users } from '../db/schema';
import { env } from '../env';
import { logger } from '../logger';
import { notify } from './notifications';
import { emitInvalidate } from '../realtime/socket';
import { createGuildTextChannel, postChannelMessage, postChannelPayload, uploadChannelFile, uploadChannelAttachment, deleteChannel } from './discordBot';

const TYPE_LABELS: Record<string, string> = { bug: 'Bug', question: 'Question', suggestion: 'Suggestion' };

export interface BridgeFile { path: string; name: string }

export function ticketBridgeEnabled(): boolean {
  return !!(env.DISCORD_BOT_TOKEN && env.DISCORD_TICKET_GUILD_ID);
}

function ticketLink(ref: string): string {
  return `/support/${ref}`;
}
function nowFr(): string {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function channelIdFor(ticketId: number): Promise<string | null> {
  const rows = await db.select({ ch: tickets.discordThreadId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  return rows[0]?.ch ?? null;
}

async function uploadFiles(channelId: string, files: BridgeFile[] | undefined): Promise<void> {
  for (const f of files ?? []) {
    await uploadChannelAttachment(channelId, f.path, f.name);
  }
}

export async function createTicketChannel(t: {
  id: number;
  ref: string;
  type: string;
  title: string;
  authorName: string | null;
  body: string;
  files?: BridgeFile[];
}): Promise<void> {
  if (!ticketBridgeEnabled()) return;
  try {
    const channelId = await createGuildTextChannel(env.DISCORD_TICKET_GUILD_ID as string, `ticket-${t.ref.toLowerCase()}`, {
      parentId: env.DISCORD_TICKET_CATEGORY_ID,
      topic: `#${t.ref} · ${t.title}`,
    });
    if (!channelId) return;
    await db.update(tickets).set({ discordThreadId: channelId }).where(eq(tickets.id, t.id));
    await postChannelPayload(channelId, {
      embeds: [
        {
          title: `🎫 Ticket #${t.ref}`,
          description: `**${t.title}**\n\n**Type** · ${TYPE_LABELS[t.type] ?? t.type}\n**Ouvert par** · ${t.authorName ?? '—'}`,
          color: 0x5865f2,
          footer: { text: 'Répondez ici : vos messages sont renvoyés au joueur sur le site.' },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 2, label: 'Fermer le ticket', custom_id: 'ticket_close', emoji: { name: '🔒' } },
            { type: 2, style: 4, label: 'Supprimer le ticket', custom_id: 'ticket_delete', emoji: { name: '🗑️' } },
          ],
        },
      ],
    });
    await postChannelMessage(channelId, `**${t.authorName ?? 'Joueur'}** :\n${t.body}`);
    await uploadFiles(channelId, t.files);
  } catch (err) {
    logger.error({ err, ref: t.ref }, 'createTicketChannel: échec');
  }
}

export async function mirrorToDiscord(ticketId: number, authorName: string, body: string, internal = false, files?: BridgeFile[]): Promise<void> {
  if (!ticketBridgeEnabled() || internal) return;
  try {
    const ch = await channelIdFor(ticketId);
    if (!ch) return;
    if (body.trim()) await postChannelMessage(ch, `**${authorName}** :\n${body}`);
    await uploadFiles(ch, files);
  } catch (err) {
    logger.error({ err, ticketId }, 'mirrorToDiscord: échec');
  }
}

export async function closeTicketBridge(t: { id: number; ref: string }, byName: string): Promise<void> {
  if (!ticketBridgeEnabled()) return;
  try {
    const ch = await channelIdFor(t.id);
    const line = `🔒 **Ticket fermé** par **${byName}** le ${nowFr()}.`;
    if (ch) await postChannelMessage(ch, line);
    if (env.DISCORD_TICKET_LOGS_CHANNEL_ID) {
      await postChannelMessage(env.DISCORD_TICKET_LOGS_CHANNEL_ID, `🔒 Ticket #${t.ref} fermé par **${byName}** le ${nowFr()}.`);
    }
  } catch (err) {
    logger.error({ err, ref: t.ref }, 'closeTicketBridge: échec');
  }
}

function buildTranscript(
  ref: string,
  title: string,
  msgs: { name: string | null; internal: boolean; fromDiscord: boolean; body: string; createdAt: Date | string | null }[],
): string {
  const rows = msgs
    .map((m) => {
      const when = m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '';
      const tag = m.internal ? '<span class="tag interne">Note interne</span>' : m.fromDiscord ? '<span class="tag discord">Discord</span>' : '';
      return `<div class="msg${m.internal ? ' int' : ''}"><div class="meta"><b>${esc(m.name ?? '—')}</b> ${tag} <span class="when">${esc(when)}</span></div><div class="body">${esc(m.body).replace(/\n/g, '<br>')}</div></div>`;
    })
    .join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ticket #${esc(ref)} — ${esc(title)}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
.wrap{max-width:800px;margin:0 auto}
h1{font-size:18px;margin:0 0 4px}.sub{color:#94a3b8;font-size:13px;margin-bottom:20px}
.msg{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px 14px;margin-bottom:10px}
.msg.int{background:#3b2f1e;border-color:#a16207}
.meta{font-size:12px;color:#cbd5e1;margin-bottom:6px}
.when{color:#64748b;margin-left:6px}
.body{font-size:14px;line-height:1.5;white-space:normal}
.tag{font-size:11px;padding:1px 6px;border-radius:6px;margin-left:4px}
.tag.interne{background:#a16207;color:#fff}.tag.discord{background:#5865f2;color:#fff}
</style></head><body><div class="wrap">
<h1>Ticket #${esc(ref)} — ${esc(title)}</h1>
<div class="sub">Transcript généré le ${esc(nowFr())}</div>
${rows}
</div></body></html>`;
}

export async function deleteTicketChannel(t: { id: number; ref: string; title: string }, byName: string): Promise<void> {
  if (!ticketBridgeEnabled()) return;
  try {
    const ch = await channelIdFor(t.id);
    if (!ch) return;
    const msgs = await db
      .select({
        name: users.displayName,
        internal: ticketMessages.internal,
        fromDiscord: ticketMessages.fromDiscord,
        body: ticketMessages.body,
        createdAt: ticketMessages.createdAt,
      })
      .from(ticketMessages)
      .leftJoin(users, eq(ticketMessages.userId, users.id))
      .where(eq(ticketMessages.ticketId, t.id))
      .orderBy(asc(ticketMessages.createdAt));
    const html = buildTranscript(t.ref, t.title, msgs);
    if (env.DISCORD_TICKET_LOGS_CHANNEL_ID) {
      await uploadChannelFile(
        env.DISCORD_TICKET_LOGS_CHANNEL_ID,
        `ticket-${t.ref}.html`,
        html,
        `🗑️ Ticket #${t.ref} — ${t.title}\nSupprimé par **${byName}** le ${nowFr()} · transcript ci-joint.`,
      );
    }
    await deleteChannel(ch);
    await db.update(tickets).set({ discordThreadId: null }).where(eq(tickets.id, t.id));
  } catch (err) {
    logger.error({ err, ref: t.ref }, 'deleteTicketChannel: échec');
  }
}

export async function handleDiscordTicketMessage(d: {
  channelId: string;
  discordUserId: string;
  discordUsername?: string;
  content: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: tickets.id, ref: tickets.ref, status: tickets.status, userId: tickets.userId, title: tickets.title })
    .from(tickets)
    .where(eq(tickets.discordThreadId, d.channelId))
    .limit(1);
  const t = rows[0];
  if (!t || t.status === 'closed') return false;
  const u = await db.select({ id: users.id }).from(users).where(eq(users.discordId, d.discordUserId)).limit(1);
  const staffUser = u[0];
  if (!staffUser) return false;
  await db.insert(ticketMessages).values({ ticketId: t.id, userId: staffUser.id, body: d.content, internal: false, fromDiscord: true });
  await db.update(tickets).set({ lastMessageAt: sql`CURRENT_TIMESTAMP`, status: 'waiting_user', resolvedAt: null }).where(eq(tickets.id, t.id));
  await notify([t.userId], { type: 'ticket', title: `Réponse du staff sur #${t.ref}`, body: t.title, link: ticketLink(t.ref) });
  emitInvalidate([`user:${t.userId}`], [['my-tickets'], ['my-ticket', t.ref]]);
  emitInvalidate(['staff', 'irs'], [['support-tickets'], ['support-ticket', t.ref]]);
  return true;
}

export async function handleDiscordTicketAction(d: { channelId: string; discordUserId: string; action: 'close' | 'delete' }): Promise<{ ok: boolean; reason?: string }> {
  const rows = await db
    .select({ id: tickets.id, ref: tickets.ref, status: tickets.status, userId: tickets.userId, title: tickets.title })
    .from(tickets)
    .where(eq(tickets.discordThreadId, d.channelId))
    .limit(1);
  const t = rows[0];
  if (!t) return { ok: false, reason: 'not_found' };
  const u = await db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.discordId, d.discordUserId)).limit(1);
  const staffUser = u[0];
  if (!staffUser) return { ok: false, reason: 'unknown_user' };
  const byName = staffUser.name;

  if (t.status !== 'closed') {
    await db.update(tickets).set({ status: 'closed', closedAt: sql`CURRENT_TIMESTAMP`, resolvedAt: null }).where(eq(tickets.id, t.id));
    await db.insert(ticketEvents).values({ ticketId: t.id, ref: t.ref, eventType: 'closed', actorUserId: staffUser.id, actorName: byName, detail: `fermé via Discord par ${byName}` }).catch(() => {});
    await notify([t.userId], { type: 'ticket', title: `Ticket #${t.ref} fermé`, body: t.title, link: ticketLink(t.ref) });
    emitInvalidate([`user:${t.userId}`], [['my-tickets'], ['my-ticket', t.ref]]);
  }
  emitInvalidate(['staff', 'irs'], [['support-tickets'], ['support-ticket', t.ref]]);

  if (d.action === 'delete') {
    await deleteTicketChannel({ id: t.id, ref: t.ref, title: t.title }, byName);
  } else {
    await closeTicketBridge({ id: t.id, ref: t.ref }, byName);
  }
  return { ok: true };
}
