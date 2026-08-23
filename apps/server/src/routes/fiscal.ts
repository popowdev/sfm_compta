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

const putSchema = z
  .object({
    dividendTaxRate: z.number().min(0).max(100),
    brackets: z.array(bracketSchema).max(20),
  })
  .superRefine((d, ctx) => {
    if (!d.brackets.length) return;
    const sorted = [...d.brackets].sort((a, b) => a.min - b.min);
    const openEnded = sorted.filter((b) => b.max === null);
    if (openEnded.length !== 1 || sorted[sorted.length - 1]!.max !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'last_bracket_must_be_open' });
    }
    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i]!;
      if (b.max !== null && b.max <= b.min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_bracket_range' });
      }
      if (i > 0) {
        const prev = sorted[i - 1]!;
        if (prev.max === null || prev.max !== b.min) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'brackets_must_be_contiguous' });
        }
      }
    }
    if (sorted[0]!.min !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'first_bracket_must_start_at_zero' });
    }
  });

fiscalRouter.put(
  '/',
  requireAppRole('irs'),
  asyncHandler(async (req, res) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'bad_request' });
    }
    await replaceFiscalConfig(parsed.data);
    emitInvalidate('irs', [['fiscal']]);
    res.json(await getFiscalConfig());
  }),
);
