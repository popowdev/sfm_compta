import { env } from '../env';
import { logger } from '../logger';

interface PriorityMeta {
  color: number;
  label: string;
  emoji: string;
}
interface TypeMeta {
  label: string;
  emoji: string;
}

const PRIORITY_DEFAULT: PriorityMeta = { color: 0xf59e0b, label: 'Normale', emoji: '🟠' };
const PRIORITY_META: Record<string, PriorityMeta> = {
  high: { color: 0xef4444, label: 'Haute', emoji: '🔴' },
  normal: PRIORITY_DEFAULT,
  low: { color: 0x22c55e, label: 'Basse', emoji: '🟢' },
};

const TYPE_DEFAULT: TypeMeta = { label: 'Question', emoji: '❓' };
const TYPE_META: Record<string, TypeMeta> = {
  bug: { label: 'Bug', emoji: '🐞' },
  question: TYPE_DEFAULT,
  suggestion: { label: 'Suggestion', emoji: '💡' },
};

export interface TicketWebhookInput {
  ref: string;
  type: string;
  priority: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatar?: string | null;
  companyName?: string | null;
  contextPath?: string | null;
  contextErrorCode?: string | null;
  attachmentCount?: number;
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export async function notifyTicketCreated(t: TicketWebhookInput): Promise<void> {
  const url = env.DISCORD_TICKET_WEBHOOK_URL;
  if (!url) return;

  const prio = PRIORITY_META[t.priority] ?? PRIORITY_DEFAULT;
  const type = TYPE_META[t.type] ?? TYPE_DEFAULT;
  const link = `${env.CLIENT_ORIGIN.replace(/\/$/, '')}/staff/support/${t.ref}`;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Priorité', value: `${prio.emoji} ${prio.label}`, inline: true },
    { name: 'Type', value: `${type.emoji} ${type.label}`, inline: true },
    { name: 'Référence', value: `\`#${t.ref}\``, inline: true },
  ];
  if (t.companyName) fields.push({ name: 'Entreprise', value: clip(t.companyName, 100), inline: true });
  if (t.contextErrorCode) {
    fields.push({ name: 'Code d’erreur', value: `\`${t.contextErrorCode}\``, inline: true });
  }
  if (t.attachmentCount) {
    fields.push({ name: 'Pièces jointes', value: `📎 ${t.attachmentCount}`, inline: true });
  }
  if (t.contextPath) {
    fields.push({ name: 'Page concernée', value: `\`${clip(t.contextPath, 200)}\``, inline: false });
  }

  const roleId = env.DISCORD_TICKET_ROLE_ID;
  const payload = {
    username: 'RP Compta · Support',
    // La mention doit être dans `content` : une mention dans un embed n'envoie aucune notification.
    ...(roleId ? { content: `<@&${roleId}>` } : {}),
    // Verrouillage : seul ce rôle peut être mentionné, même si un joueur écrit @everyone dans son ticket.
    allowed_mentions: { parse: [] as string[], roles: roleId ? [roleId] : [] },
    embeds: [
      {
        title: `${type.emoji} ${clip(t.title, 240)}`,
        url: link,
        description: `>>> ${clip(t.body, 500)}`,
        color: prio.color,
        author: {
          name: clip(t.authorName, 120),
          ...(t.authorAvatar ? { icon_url: t.authorAvatar } : {}),
        },
        fields,
        footer: { text: `Nouveau ticket · clique le titre pour l’ouvrir` },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await postWebhook(url, payload);
}

async function postWebhook(url: string, payload: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) logger.warn({ status: res.status }, 'discord webhook rejected');
  } catch (err) {
    logger.warn({ err }, 'discord webhook failed');
  } finally {
    clearTimeout(timer);
  }
}

// Garde anti-spam : au plus MAX_PER_WINDOW alertes d'erreur par fenêtre, pour ne pas
// noyer Discord (ni se faire rate-limiter) si un bug part en boucle.
const ERR_WINDOW_MS = 60_000;
const ERR_MAX_PER_WINDOW = 8;
let errWindowStart = 0;
let errWindowCount = 0;
let errSuppressed = 0;

export interface ErrorWebhookInput {
  code: string;
  source: 'server' | 'client';
  message: string;
  method?: string | null;
  path?: string | null;
  userName?: string | null;
}

export async function notifyErrorDetected(e: ErrorWebhookInput): Promise<void> {
  const url = env.DISCORD_TICKET_WEBHOOK_URL;
  if (!url) return;

  const now = Date.now();
  if (now - errWindowStart > ERR_WINDOW_MS) {
    // Nouvelle fenêtre : si des erreurs ont été étouffées, on le signale.
    if (errSuppressed > 0) {
      void postWebhook(url, {
        username: 'RP Compta · Erreurs',
        embeds: [
          {
            title: '⚠️ Trop d’erreurs',
            description: `${errSuppressed} autre(s) erreur(s) non affichée(s) dans la dernière minute (anti-spam).`,
            color: 0xf59e0b,
          },
        ],
      });
    }
    errWindowStart = now;
    errWindowCount = 0;
    errSuppressed = 0;
  }
  if (errWindowCount >= ERR_MAX_PER_WINDOW) {
    errSuppressed++;
    return;
  }
  errWindowCount++;

  const sourceLabel = e.source === 'server' ? 'Serveur' : 'Client (navigateur)';
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: 'Code', value: `\`${e.code}\``, inline: true },
    { name: 'Source', value: sourceLabel, inline: true },
  ];
  if (e.path) {
    fields.push({ name: 'Emplacement', value: `\`${clip(`${e.method ? `${e.method} ` : ''}${e.path}`, 200)}\``, inline: false });
  }
  if (e.userName) fields.push({ name: 'Utilisateur', value: clip(e.userName, 100), inline: true });

  await postWebhook(url, {
    username: 'RP Compta · Erreurs',
    embeds: [
      {
        title: '🛑 Erreur détectée',
        description: `\`\`\`${clip(e.message || 'erreur inconnue', 600)}\`\`\``,
        color: 0xef4444,
        fields,
        footer: { text: `Consulte le code ${e.code} côté staff pour la stack complète` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
