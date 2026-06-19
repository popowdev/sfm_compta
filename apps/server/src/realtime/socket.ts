import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { env } from '../env';
import { logger } from '../logger';
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
      if (user) socket.data.userId = user.id;
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as number | undefined;
    if (userId) socket.join(`user:${userId}`);
    socket.on('disconnect', (reason) => logger.debug({ id: socket.id, reason }, 'socket déconnecté'));
  });

  return io;
}

export function getIo(): IOServer | null {
  return io;
}
