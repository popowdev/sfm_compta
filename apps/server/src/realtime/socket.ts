import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { and, eq } from 'drizzle-orm';
import { SOCKET_EVENTS } from '@rp-compta/shared';
import { env } from '../env';
import { logger } from '../logger';
import { db } from '../db';
import { userAppRoles, memberships, associationMembers } from '../db/schema';
import { getSessionUser, SESSION_COOKIE } from '../auth/session';

let io: IOServer | null = null;

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  io.use(async (socket, next) => {
    const sid = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    if (sid) {
      const user = await getSessionUser(sid);
      if (user) {
        socket.data.userId = user.id;
        const roleRows = await db
          .select({ role: userAppRoles.role })
          .from(userAppRoles)
          .where(eq(userAppRoles.userId, user.id));
        socket.data.appRoles = roleRows.map((r) => r.role);
        const memRows = await db
          .select({ companyId: memberships.companyId })
          .from(memberships)
          .where(and(eq(memberships.userId, user.id), eq(memberships.active, true)));
        socket.data.companyIds = memRows.map((r) => r.companyId);
        const assocRows = await db
          .select({ associationId: associationMembers.associationId })
          .from(associationMembers)
          .where(and(eq(associationMembers.userId, user.id), eq(associationMembers.active, true)));
        socket.data.associationIds = assocRows.map((r) => r.associationId);
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as number | undefined;
    if (userId) {
      socket.join(`user:${userId}`);
      const appRoles = (socket.data.appRoles as string[] | undefined) ?? [];
      if (appRoles.includes('irs') || appRoles.includes('staff')) socket.join('irs');
      for (const cid of (socket.data.companyIds as number[] | undefined) ?? []) {
        socket.join(`company:${cid}`);
      }
      for (const aid of (socket.data.associationIds as number[] | undefined) ?? []) {
        socket.join(`assoc:${aid}`);
      }
    }
    socket.on('disconnect', (reason) => logger.debug({ id: socket.id, reason }, 'socket déconnecté'));
  });

  return io;
}

export function getIo(): IOServer | null {
  return io;
}

export function emitInvalidate(rooms: string | string[], keys: (string | number)[][]): void {
  io?.to(rooms).emit(SOCKET_EVENTS.dataInvalidate, keys);
}

export function emitInvalidateAll(keys: (string | number)[][]): void {
  io?.emit(SOCKET_EVENTS.dataInvalidate, keys);
}

const ACCOUNTING_KEYS = ['exercices', 'exercice', 'dashboard', 'my-pay', 'employees-perf', 'stats'] as const;

export function emitCompta(companyId: number, ownKeys: (string | number)[][] = []): void {
  emitInvalidate(
    ['irs', `company:${companyId}`],
    [...ownKeys, ...ACCOUNTING_KEYS.map((k) => [k, companyId] as (string | number)[])],
  );
}
