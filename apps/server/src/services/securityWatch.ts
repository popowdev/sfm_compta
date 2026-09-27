import type { Request, Response, NextFunction } from 'express';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db';
import { securityEvents, sessions, users } from '../db/schema';
import { env } from '../env';

export interface AttackHit {
  kind: string;
  pattern: string;
}

const RULES: { kind: string; label: string; re: RegExp }[] = [
  { kind: 'sqli', label: 'injection SQL', re: /(%27|')\s*(or|and)\s|union\s+select|\bselect\b.+\bfrom\b|\bdrop\s+table\b|\binsert\s+into\b|sleep\s*\(|benchmark\s*\(|\bor\b\s+1\s*=\s*1|--\s*$|;\s*--/i },
  { kind: 'xss', label: 'injection XSS', re: /<\s*script|onerror\s*=|onload\s*=|javascript:|<\s*img[^>]+src\s*=|<\s*iframe|document\.cookie/i },
  { kind: 'traversal', label: 'traversée de répertoire', re: /(\.\.[/\\]){2,}|%2e%2e(%2f|%5c)|\/etc\/(passwd|shadow)|\/proc\/self/i },
  { kind: 'secret_file', label: 'vol de fichier sensible', re: /\/\.(env|git|htaccess|htpasswd|ssh|aws|npmrc|DS_Store)(\/|$|\.)|\/(id_rsa|web\.config|wp-config\.php|composer\.lock)$/i },
  { kind: 'admin_probe', label: 'sondage admin', re: /\/api\/admin\/(impersonate|login-as|users|sessions|config|settings|roles|staff)|\/(phpmyadmin|wp-admin|wp-login|adminer|xmlrpc\.php)/i },
  { kind: 'cms_probe', label: 'sondage CMS', re: /\/(phpmyadmin|wp-admin|wp-login|wp-content|adminer|xmlrpc\.php|cgi-bin)/i },
  { kind: 'cmd_injection', label: 'injection de commande', re: /(;|\||`|\$\()\s*(cat|ls|whoami|curl|wget|nc|bash|sh)\s|\/bin\/(bash|sh)\b/i },
];

const SCANNER_UA = /sqlmap|nikto|nmap|masscan|acunetix|nessus|zgrab|dirbuster|gobuster|wpscan|havij|hydra/i;

export function detectAttack(req: Request): AttackHit | null {
  const url = decodeSafe(req.originalUrl || req.url || '');
  const ua = String(req.headers['user-agent'] ?? '');
  let body = '';
  const b = (req as { body?: unknown }).body;
  if (b && typeof b === 'object') {
    try {
      body = decodeSafe(JSON.stringify(b).slice(0, 2000));
    } catch {
      body = '';
    }
  }
  const haystack = `${url}\n${body}`;
  for (const r of RULES) {
    const m = r.re.exec(haystack);
    if (m) return { kind: r.kind, pattern: `${r.label} · ${m[0].slice(0, 120)}` };
  }
  if (SCANNER_UA.test(ua)) return { kind: 'scanner', pattern: `outil de scan · ${ua.slice(0, 120)}` };
  return null;
}

function decodeSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function clientIp(req: Request): string {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  return (fwd || req.ip || req.socket.remoteAddress || 'inconnue').slice(0, 45);
}

const ALERT_WINDOW_MS = 10 * 60_000;
const lastAlert = new Map<string, { at: number; count: number }>();

export function securityWatch(req: Request, res: Response, next: NextFunction): void {
  const hit = detectAttack(req);
  if (!hit) return next();
  const ip = clientIp(req);
  const method = String(req.method).slice(0, 10);
  const path = String(req.originalUrl || req.url || '').slice(0, 500);
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 300) || null;
  res.on('finish', () => {
    const userId = req.user?.id ?? null;
    if (hit.kind === 'admin_probe' && userId != null && res.statusCode < 400) return;
    void record({ ip, hit, method, path, ua, userId, status: res.statusCode });
  });
  next();
}

async function record(p: {
  ip: string;
  hit: AttackHit;
  method: string;
  path: string;
  ua: string | null;
  userId: number | null;
  status: number;
}): Promise<void> {
  try {
    await db.insert(securityEvents).values({
      ip: p.ip,
      kind: p.hit.kind,
      pattern: p.hit.pattern.slice(0, 200),
      method: p.method,
      path: p.path,
      userAgent: p.ua,
      userId: p.userId,
      status: p.status,
    });
  } catch {
    return;
  }
  const prev = lastAlert.get(p.ip);
  const now = Date.now();
  if (prev && now - prev.at < ALERT_WINDOW_MS) {
    prev.count += 1;
    return;
  }
  const suppressed = prev?.count ?? 0;
  lastAlert.set(p.ip, { at: now, count: 0 });
  void alertOwner(p, suppressed);
}

async function alertOwner(
  p: { ip: string; hit: AttackHit; method: string; path: string; ua: string | null; userId: number | null; status: number },
  suppressed: number,
): Promise<void> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return;
  const targets = (env.SECURITY_ALERT_DISCORD_IDS ?? env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{5,32}$/.test(s));
  if (!targets.length) return;

  const since = new Date(Date.now() - 30 * 60_000);
  let connected: { name: string; discordId: string }[] = [];
  let attacker: { name: string; discordId: string } | null = null;
  try {
    const rows = await db
      .selectDistinct({ name: users.displayName, discordId: users.discordId, seenAt: users.updatedAt })
      .from(users)
      .innerJoin(sessions, eq(sessions.userId, users.id))
      .where(and(gt(sessions.expiresAt, new Date()), gt(users.updatedAt, since)))
      .orderBy(desc(users.updatedAt))
      .limit(15);
    const seen = new Set<string>();
    connected = rows
      .filter((r) => (seen.has(r.discordId) ? false : (seen.add(r.discordId), true)))
      .map((r) => ({ name: r.name, discordId: r.discordId }));
    if (p.userId) {
      const a = await db
        .select({ name: users.displayName, discordId: users.discordId })
        .from(users)
        .where(eq(users.id, p.userId))
        .limit(1);
      attacker = a[0] ?? null;
    }
  } catch {
  }

  let recent = 0;
  try {
    const c = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(securityEvents)
      .where(and(eq(securityEvents.ip, p.ip), gt(securityEvents.createdAt, since)));
    recent = Number(c[0]?.n ?? 0);
  } catch {
  }

  const fields = [
    { name: 'Type', value: p.hit.pattern, inline: false },
    { name: 'IP', value: `\`${p.ip}\``, inline: true },
    { name: 'Réponse', value: `\`${p.status}\``, inline: true },
    { name: 'Tentatives (30 min)', value: String(recent), inline: true },
    { name: 'Requête', value: `\`${p.method} ${p.path.slice(0, 300)}\``, inline: false },
  ];
  if (p.ua) fields.push({ name: 'Navigateur / outil', value: `\`${p.ua.slice(0, 200)}\``, inline: false });
  fields.push({
    name: 'Compte utilisé',
    value: attacker ? `${attacker.name} — \`${attacker.discordId}\`` : 'aucun (non authentifié)',
    inline: false,
  });
  fields.push({
    name: `Connectés à cet instant (${connected.length})`,
    value: connected.length
      ? connected.map((c) => `• ${c.name} — \`${c.discordId}\``).join('\n').slice(0, 1000)
      : 'personne',
    inline: false,
  });
  if (suppressed > 0) {
    fields.push({ name: 'Note', value: `${suppressed} tentative(s) de cette IP regroupées depuis la dernière alerte.`, inline: false });
  }

  const payload = {
    content: `🚨 **Tentative d'intrusion détectée** — <@${targets[0]}>`,
    embeds: [
      {
        title: '🛡️ Alerte sécurité',
        color: 15158332,
        fields,
        footer: { text: 'RP Compta · surveillance automatique' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  for (const id of targets) {
    try {
      const dm = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: id }),
      });
      if (!dm.ok) continue;
      const chan = (await dm.json()) as { id?: string };
      if (!chan.id) continue;
      await fetch(`https://discord.com/api/v10/channels/${chan.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
    }
  }
}
