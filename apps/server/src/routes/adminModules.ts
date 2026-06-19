import { Router } from 'express';
import { z } from 'zod';
import { MODULE_KEYS, type ModuleKey } from '@rp-compta/shared';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getEffectiveModules, setModuleSettings } from '../services/modules';
import { emitInvalidateAll } from '../realtime/socket';

export const adminModulesRouter = Router();

adminModulesRouter.use(requireAuth, requireAppRole('staff'));

adminModulesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getEffectiveModules());
  }),
);

const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  group: z.string().min(1).max(80).optional(),
  blocked: z.boolean().optional(),
});

adminModulesRouter.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!key || !(MODULE_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    await setModuleSettings(key as ModuleKey, parsed.data);
    emitInvalidateAll([['admin-modules'], ['company-modules'], ['my-companies']]);
    res.json({ ok: true });
  }),
);
