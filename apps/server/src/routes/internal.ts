import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { applyWhitelistChange } from '../services/revocation';
import { asyncHandler } from '../middleware/asyncHandler';

export const internalRouter = Router();

const bodySchema = z.object({
  discordId: z.string().min(1),
  whitelisted: z.boolean(),
});

internalRouter.use((req, res, next) => {
  if (!env.INTERNAL_API_KEY || req.get('x-internal-key') !== env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

internalRouter.post(
  '/whitelist',
  asyncHandler(async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const found = await applyWhitelistChange(parsed.data.discordId, parsed.data.whitelisted);
    res.json({ ok: true, found });
  }),
);
