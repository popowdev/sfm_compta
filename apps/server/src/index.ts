import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './env';
import { logger } from './logger';
import { healthRouter } from './routes/health';
import { createSocketServer } from './realtime/socket';

const app = express();
app.disable('x-powered-by');

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`RP Compta API → http://127.0.0.1:${env.PORT} (${env.NODE_ENV})`);
});
