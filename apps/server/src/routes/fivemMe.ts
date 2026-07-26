import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { fivemPlayers, fivemCharacters } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { fetchGameCharacters, isUnemployedJob } from '../services/fivemPull';
import { provisionAllCharacters, saveCharacterList, resolveJobGradeLabels } from '../services/fivemSync';
import { emitInvalidate } from '../realtime/socket';

export const meFivemRouter = Router();
meFivemRouter.use(requireAuth);

async function selectedName(discord: string): Promise<string | null> {
  const rows = await db
    .select({ s: fivemPlayers.selectedChar })
    .from(fivemPlayers)
    .where(eq(fivemPlayers.discordId, discord))
    .limit(1);
  return rows[0]?.s ?? null;
}

meFivemRouter.get(
  '/characters',
  asyncHandler(async (req, res) => {
    const discord = req.user!.discordId;
    const [result, selected] = await Promise.all([fetchGameCharacters(discord), selectedName(discord)]);
    if (!result.ok) {
      // API du jeu injoignable → repli sur les personnages déjà synchronisés en base,
      // pour que le sélecteur reste utilisable (affichage) même serveur de jeu down.
      const stored = await db
        .select()
        .from(fivemCharacters)
        .where(eq(fivemCharacters.discordId, discord));
      const labels = await resolveJobGradeLabels(stored.map((c) => ({ jobId: c.jobId, grade: c.grade })));
      return res.json({
        ok: stored.length > 0,
        reason: result.reason,
        cached: true,
        selected,
        characters: stored.map((c) => ({
          name: c.name,
          jobId: c.jobId,
          job: c.unemployed ? null : labels.jobLabel(c.jobId, c.jobLabel),
          grade: c.grade,
          gradeLabel: labels.gradeLabel(c.jobId, c.grade, c.gradeLabel),
          unemployed: c.unemployed,
        })),
      });
    }
    await saveCharacterList(discord, result.characters);
    const labels = await resolveJobGradeLabels(result.characters.map((c) => ({ jobId: c.jobId, grade: c.grade })));
    res.json({
      ok: true,
      cached: false,
      selected,
      characters: result.characters.map((c) => {
        const unemployed = isUnemployedJob(c.jobId);
        return {
          name: c.name,
          jobId: c.jobId,
          job: unemployed ? null : labels.jobLabel(c.jobId, c.jobLabel),
          grade: c.grade,
          gradeLabel: labels.gradeLabel(c.jobId, c.grade, c.gradeLabel),
          unemployed,
        };
      }),
    });
  }),
);

const selectSchema = z.object({ name: z.string().trim().min(1).max(120) });

meFivemRouter.post(
  '/select',
  asyncHandler(async (req, res) => {
    const discord = req.user!.discordId;
    const parsed = selectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await fetchGameCharacters(discord);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'invalid' ? 400 : 502;
      return res.status(status).json({ error: result.reason });
    }
    const match = result.characters.find((c) => c.name === parsed.data.name);
    if (!match) return res.status(404).json({ error: 'char_not_found' });
    const out = await provisionAllCharacters(discord, result.characters, parsed.data.name);
    emitInvalidate(`user:${out.userId}`, [['my-companies']]);
    emitInvalidate('irs', [['fivem-players'], ['companies'], ['members']]);
    res.json({ ok: true, companyId: out.selectedCompanyId, job: isUnemployedJob(match.jobId) ? null : match.jobLabel });
  }),
);
