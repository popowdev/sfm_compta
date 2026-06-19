import { Router } from 'express';
import type { HealthResponse } from '@rp-compta/shared';
import { pingDb } from '../db';
import { logger } from '../logger';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'rp-compta-api',
    version: '0.0.0',
    uptime: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

healthRouter.get('/db', async (_req, res) => {
  try {
    await pingDb();
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    logger.error({ err }, 'DB ping failed');
    res.status(503).json({ status: 'error', db: 'down' });
  }
});
