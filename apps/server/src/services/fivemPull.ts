import { z } from 'zod';
import { env } from '../env';

export interface GameChar {
  name: string;
  dob: string | null;
  jobId: string;
  jobLabel: string;
  grade: number;
  gradeLabel: string;
}

export type PullReason = 'invalid' | 'not_found' | 'unreachable' | 'unconfigured';
export type PullResult =
  | { ok: true; characters: GameChar[] }
  | { ok: false; reason: PullReason };

const UNEMPLOYED_JOBS = new Set(['unemployed', '', 'chomage']);

export function isUnemployedJob(jobId: string): boolean {
  return UNEMPLOYED_JOBS.has(jobId.trim().toLowerCase());
}

const DISCORD_RE = /^\d{5,32}$/;

const charSchema = z.object({
  name: z.string().max(120).optional().default(''),
  dateofbirth: z.string().max(40).nullish(),
  job: z.object({ id: z.string().max(64), label: z.string().max(120).optional() }),
  job_grade: z.object({ id: z.coerce.number().int().min(0).max(255), label: z.string().max(120).optional() }),
});
const resSchema = z.object({
  status: z.string().optional(),
  character: z.array(charSchema).max(64).default([]),
});

export async function fetchGameCharacters(discordId: string): Promise<PullResult> {
  if (!DISCORD_RE.test(discordId)) return { ok: false, reason: 'invalid' };
  const base = env.FIVEM_PLAYER_API_URL;
  if (!base) return { ok: false, reason: 'unconfigured' };

  const headers: Record<string, string> = { accept: 'application/json' };
  if (env.FIVEM_PLAYER_API_TOKEN) headers.authorization = `Bearer ${env.FIVEM_PLAYER_API_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}/${discordId}`, {
      signal: controller.signal,
      headers,
      redirect: 'manual',
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (res.status === 400) return { ok: false, reason: 'invalid' };
  if (!res.ok) return { ok: false, reason: 'unreachable' };
  if (Number(res.headers.get('content-length')) > 512_000) return { ok: false, reason: 'unreachable' };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  const parsed = resSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'unreachable' };

  const characters: GameChar[] = parsed.data.character.map((c) => ({
    name: c.name.slice(0, 120),
    dob: c.dateofbirth ?? null,
    jobId: c.job.id.trim().slice(0, 64),
    jobLabel: (c.job.label ?? c.job.id).slice(0, 120),
    grade: c.job_grade.id,
    gradeLabel: (c.job_grade.label ?? `Grade ${c.job_grade.id}`).slice(0, 120),
  }));
  return { ok: true, characters };
}
