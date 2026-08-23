import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { errorLog, users } from '../db/schema';
import { notifyErrorDetected } from './discordWebhook';

// Code court, lisible, à communiquer au staff pour retrouver la panne exacte.
export function genErrorCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

const stripMarkup = (v: string): string =>
  v.replace(/[<>]/g, (c) => (c === '<' ? '\u2039' : '\u203a')).replace(/[\u0000-\u001f]/g, ' ');

export async function recordError(p: {
  code: string;
  source: 'server' | 'client';
  message: string;
  stack?: string | null;
  method?: string | null;
  path?: string | null;
  userId?: number | null;
  notify?: boolean;
}): Promise<void> {
  const message = stripMarkup((p.message || '').slice(0, 500));
  const path = p.path ? stripMarkup(p.path.slice(0, 255)) : null;
  try {
    await db.insert(errorLog).values({
      code: p.code,
      source: p.source,
      message,
      stack: p.stack ? p.stack.slice(0, 8000) : null,
      method: p.method ?? null,
      path,
      userId: p.userId ?? null,
    });
  } catch {
    // le logging d'erreur ne doit jamais casser l'action sous-jacente
  }

  // Alerte Discord (fire-and-forget) : ne doit jamais bloquer ni casser la requête.
  if (p.notify === false) return;
  void (async () => {
    let userName: string | null = null;
    if (p.userId) {
      try {
        const u = await db.select({ n: users.displayName }).from(users).where(eq(users.id, p.userId)).limit(1);
        userName = u[0]?.n ?? null;
      } catch {
        /* ignore */
      }
    }
    await notifyErrorDetected({
      code: p.code,
      source: p.source,
      message,
      method: p.method,
      path,
      userName,
    });
  })();
}
