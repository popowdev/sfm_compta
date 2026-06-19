import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getFiscalConfig, replaceFiscalConfig } from '../services/fiscal';
import { emitInvalidate } from '../realtime/socket';

export const fiscalRouter = Router();

fiscalRouter.use(requireAuth);

fiscalRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getFiscalConfig());
  }),
);

const bracketSchema = z.object({
  min: z.number().min(0),
  max: z.number().min(0).nullable(),
  rate: z.number().min(0).max(100),
});

const putSchema = z.object({
  dividendTaxRate: z.number().min(0).max(100),
  brackets: z.array(bracketSchema).max(20),
});

fiscalRouter.put(
  '/',
  requireAppRole('irs'),
  asyncHandler(async (req, res) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await replaceFiscalConfig(parsed.data);
    emitInvalidate('irs', [['fiscal']]);
    res.json(await getFiscalConfig());
  }),
);
