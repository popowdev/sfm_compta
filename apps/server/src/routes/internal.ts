import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { applyWhitelistChange } from '../services/revocation';
import { handleDiscordTicketMessage, handleDiscordTicketAction } from '../services/ticketBridge';
import { asyncHandler } from '../middleware/asyncHandler';

export const internalRouter = Router();

const bodySchema = z.object({
  discordId: z.string().min(1),
  whitelisted: z.boolean(),
});

const discordTicketMsgSchema = z.object({
  channelId: z.string().regex(/^\d{5,32}$/),
  discordUserId: z.string().regex(/^\d{5,32}$/),
  discordUsername: z.string().max(64).optional(),
  content: z.string().trim().min(1).max(4000),
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

internalRouter.post(
  '/tickets/discord-message',
  asyncHandler(async (req, res) => {
    const parsed = discordTicketMsgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const handled = await handleDiscordTicketMessage(parsed.data);
    res.json({ ok: true, handled });
  }),
);

const discordActionSchema = z.object({
  channelId: z.string().regex(/^\d{5,32}$/),
  discordUserId: z.string().regex(/^\d{5,32}$/),
  action: z.enum(['close', 'delete']),
});

internalRouter.post(
  '/tickets/discord-action',
  asyncHandler(async (req, res) => {
    const parsed = discordActionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await handleDiscordTicketAction(parsed.data);
    res.json(result);
  }),
);
