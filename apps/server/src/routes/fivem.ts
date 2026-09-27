import { Router } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { desc, like, or, sql } from 'drizzle-orm';
import { env } from '../env';
import { db } from '../db';
import { fivemPlayers, fivemCharacters } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { applySync, pullAndProvision, applyCharacterList, resolveJobGradeLabels } from '../services/fivemSync';
import { fetchGameCharacters, isUnemployedJob, type GameChar } from '../services/fivemPull';
import { emitInvalidate } from '../realtime/socket';

function tokenOk(header: string | undefined): boolean {
  const expected = env.FIVEM_SYNC_TOKEN;
  if (!expected) return false;
  if (!header || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const gradeDef = z.object({
  grade: z.coerce.number().int().min(0).max(255),
  label: z.string().max(120).optional(),
});
const jobDef = z.object({
  name: z.string().trim().min(1).max(64),
  label: z.string().max(120).optional(),
  grades: z.array(gradeDef).max(64).optional(),
});
const playerDef = z.object({
  discord: z.string().trim().regex(/^\d{5,32}$/),
  identifier: z.string().max(80).optional(),
  name: z.string().max(120).optional(),
  job: z.string().trim().min(1).max(64),
  grade: z.coerce.number().int().min(0).max(255),
  online: z.boolean().optional(),
});
const syncSchema = z.object({
  jobs: z.array(jobDef).max(200).optional(),
  players: z.array(playerDef).max(1000).optional(),
  full: z.boolean().optional(),
});

export const fivemRouter = Router();

fivemRouter.post(
  '/sync',
  asyncHandler(async (req, res) => {
    if (!tokenOk(req.header('authorization'))) return res.status(401).json({ error: 'unauthorized' });
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const result = await applySync(parsed.data);
    emitInvalidate('irs', [['fivem-players'], ['companies'], ['members']]);
    res.json({ ok: true, ...result });
  }),
);

const pushCharSchema = z.object({
  name: z.string().max(120).optional().default(''),
  dateofbirth: z.string().max(40).nullish(),
  job: z.object({ id: z.string().max(64), label: z.string().max(120).optional() }),
  job_grade: z.object({ id: z.coerce.number().int().min(0).max(255), label: z.string().max(120).optional() }),
});
const pushPlayerSchema = z.object({
  discordId: z.string().trim().regex(/^\d{5,32}$/),
  status: z.string().optional(),
  character: z.array(pushCharSchema).max(64).default([]),
});
const pushSchema = z.union([pushPlayerSchema, z.object({ players: z.array(pushPlayerSchema).max(500) })]);

function toGameChar(c: z.infer<typeof pushCharSchema>): GameChar {
  return {
    name: (c.name || '').slice(0, 120),
    dob: c.dateofbirth ?? null,
    jobId: c.job.id.trim().slice(0, 64),
    jobLabel: (c.job.label ?? c.job.id).slice(0, 120),
    grade: c.job_grade.id,
    gradeLabel: (c.job_grade.label ?? `Grade ${c.job_grade.id}`).slice(0, 120),
  };
}

fivemRouter.post(
  '/push',
  asyncHandler(async (req, res) => {
    if (!tokenOk(req.header('authorization'))) return res.status(401).json({ error: 'unauthorized' });
    const parsed = pushSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const players = 'players' in parsed.data ? parsed.data.players : [parsed.data];
    const userIds = new Set<number>();
    for (const p of players) {
      const uid = await applyCharacterList(p.discordId, p.character.map(toGameChar));
      if (uid) userIds.add(uid);
    }
    emitInvalidate('irs', [['fivem-players'], ['companies'], ['members'], ['admin-users']]);
    for (const uid of userIds) emitInvalidate(`user:${uid}`, [['my-companies']]);
    res.json({ ok: true, players: players.length });
  }),
);

fivemRouter.get(
  '/directory',
  asyncHandler(async (req, res) => {
    if (!tokenOk(req.header('authorization'))) return res.status(401).json({ error: 'unauthorized' });
    const rows = await db
      .select({ name: fivemCharacters.name, discordId: fivemCharacters.discordId, job: fivemCharacters.jobLabel })
      .from(fivemCharacters)
      .orderBy(fivemCharacters.name);
    res.json({ ok: true, count: rows.length, players: rows });
  }),
);

const playersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
});

fivemRouter.get(
  '/players',
  requireAuth,
  requireAppRole('staff'),
  asyncHandler(async (req, res) => {
    const parsed = playersQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const { page, limit } = parsed.data;
    const q = parsed.data.q?.trim();
    const offset = (page - 1) * limit;
    const filter = q
      ? or(like(fivemPlayers.name, `%${q}%`), like(fivemPlayers.discordId, `%${q}%`))
      : undefined;

    const [countRows, rows, statRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(fivemPlayers).where(filter),
      db
        .select()
        .from(fivemPlayers)
        .where(filter)
        .orderBy(desc(fivemPlayers.online), fivemPlayers.name)
        .limit(limit)
        .offset(offset),
      db
        .select({
          online: sql<number>`COALESCE(SUM(CASE WHEN ${fivemPlayers.online} THEN 1 ELSE 0 END), 0)`,
          known: sql<number>`COUNT(*)`,
          jobs: sql<number>`COUNT(DISTINCT NULLIF(${fivemPlayers.job}, ''))`,
        })
        .from(fivemPlayers),
    ]);
    res.json({
      players: rows,
      total: Number(countRows[0]?.n ?? 0),
      page,
      limit,
      stats: {
        online: Number(statRows[0]?.online ?? 0),
        known: Number(statRows[0]?.known ?? 0),
        jobs: Number(statRows[0]?.jobs ?? 0),
      },
    });
  }),
);

const discordParam = z.string().trim().regex(/^\d{5,32}$/);

fivemRouter.get(
  '/lookup/:discordId',
  requireAuth,
  requireAppRole('staff'),
  asyncHandler(async (req, res) => {
    const discordId = req.params.discordId ?? '';
    if (!discordParam.safeParse(discordId).success) return res.status(400).json({ error: 'invalid' });
    const result = await fetchGameCharacters(discordId);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'invalid' ? 400 : 502;
      return res.status(status).json({ error: result.reason });
    }
    const labels = await resolveJobGradeLabels(result.characters.map((c) => ({ jobId: c.jobId, grade: c.grade })));
    res.json({
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

const applySchema = z.object({
  discordId: discordParam,
  name: z.string().trim().min(1).max(120),
});

fivemRouter.post(
  '/apply',
  requireAuth,
  requireAppRole('staff'),
  asyncHandler(async (req, res) => {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
    const out = await pullAndProvision(parsed.data.discordId, parsed.data.name);
    if (!out.ok) {
      const status =
        out.reason === 'not_found' || out.reason === 'char_not_found'
          ? 404
          : out.reason === 'invalid'
            ? 400
            : 502;
      return res.status(status).json({ error: out.reason });
    }
    emitInvalidate(`user:${out.userId}`, [['my-companies']]);
    emitInvalidate('irs', [['fivem-players'], ['companies'], ['members']]);
    res.json({ ok: true, companyId: out.companyId, job: out.job });
  }),
);
