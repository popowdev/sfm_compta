import { and, eq, lt, sql } from 'drizzle-orm';
import { moduleConfigBool } from '@rp-compta/shared';
import { db } from '../db';
import { companyModules, exercices } from '../db/schema';
import { bizWeek } from './bizTime';
import { snapshotExerciceIfClosed } from '../routes/exercices';

export async function runWeeklyRollover(): Promise<{ created: number; closed: number }> {
  const mods = await db
    .select({ companyId: companyModules.companyId, config: companyModules.config })
    .from(companyModules)
    .where(and(eq(companyModules.moduleKey, 'exercices'), eq(companyModules.enabled, true)));

  const companies = mods
    .filter((m) => {
      const raw = m.config;
      const cfg = (typeof raw === 'string' ? JSON.parse(raw || 'null') : raw) as Record<string, unknown> | null;
      return moduleConfigBool(cfg, 'exercices', 'autoWeek');
    })
    .map((m) => m.companyId);
  if (!companies.length) return { created: 0, closed: 0 };

  const { monday, sunday, label } = bizWeek();
  let created = 0;
  let closed = 0;

  for (const companyId of companies) {
    const toClose = await db
      .select({ id: exercices.id })
      .from(exercices)
      .where(
        and(
          eq(exercices.companyId, companyId),
          eq(exercices.status, 'open'),
          lt(exercices.endDate, monday),
          sql`DATEDIFF(${exercices.endDate}, ${exercices.startDate}) = 6`,
        ),
      );
    const upd = await db
      .update(exercices)
      .set({ status: 'closed' })
      .where(
        and(
          eq(exercices.companyId, companyId),
          eq(exercices.status, 'open'),
          lt(exercices.endDate, monday),
          sql`DATEDIFF(${exercices.endDate}, ${exercices.startDate}) = 6`,
        ),
      );
    closed += upd[0].affectedRows ?? 0;
    for (const e of toClose) await snapshotExerciceIfClosed(companyId, e.id).catch(() => undefined);

    const existing = await db
      .select({ id: exercices.id })
      .from(exercices)
      .where(and(eq(exercices.companyId, companyId), eq(exercices.startDate, monday), eq(exercices.endDate, sunday)))
      .limit(1);
    if (!existing[0]) {
      try {
        await db.insert(exercices).values({ companyId, label, startDate: monday, endDate: sunday });
        created += 1;
      } catch (err) {
        if ((err as { code?: string }).code !== 'ER_DUP_ENTRY') throw err;
      }
    }
  }
  return { created, closed };
}
