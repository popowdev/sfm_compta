import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { env } from '../env';
import { logger } from '../logger';

export function createSocketServer(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  io.on('connection', (socket) => {
    logger.debug({ id: socket.id }, 'socket connecté');
    socket.on('disconnect', (reason) => {
      logger.debug({ id: socket.id, reason }, 'socket déconnecté');
    });
  });

  return io;
}
