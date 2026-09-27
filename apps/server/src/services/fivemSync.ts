import { and, eq, isNull, inArray, notInArray, sql } from 'drizzle-orm';
import { MODULES } from '@rp-compta/shared';
import { defaultPermRows } from './grades';
import { fetchGameCharacters, isUnemployedJob, isUnemployedLabel, type GameChar } from './fivemPull';
import { db } from '../db';
import {
  companies,
  companyModules,
  companyRoles,
  companyEmployees,
  memberships,
  rolePermissions,
  users,
  fivemPlayers,
  fivemCharacters,
} from '../db/schema';
import { slugify, uniqueSlug } from './companies';

export interface JobDef {
  name: string;
  label?: string;
  grades?: { grade: number; label?: string }[];
}
export interface PlayerDef {
  discord: string;
  identifier?: string;
  name?: string;
  job: string;
  grade: number;
  online?: boolean;
}
export interface SyncPayload {
  jobs?: JobDef[];
  players?: PlayerDef[];
  full?: boolean;
}

function isDuplicate(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

async function resolveUserId(discordId: string, displayName: string): Promise<number> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discordId)).limit(1);
  if (existing[0]) return existing[0].id;
  try {
    const inserted = await db.insert(users).values({ discordId, displayName: displayName || discordId });
    return inserted[0].insertId;
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const again = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discordId)).limit(1);
    if (!again[0]) throw new Error('user_resolve_failed');
    return again[0].id;
  }
}

function cleanGradeName(name: string | null | undefined, grade: number): string {
  const n = (name ?? '').trim();
  if (!n || /^(unknown|unemployed)$/i.test(n)) return `Grade ${grade}`;
  return n.slice(0, 60);
}

async function createRole(companyId: number, name: string, grade: number, canManage: boolean): Promise<void> {
  const inserted = await db
    .insert(companyRoles)
    .values({ companyId, name: cleanGradeName(name, grade), rank: grade, canManage, fivemGrade: grade });
  const roleId = inserted[0].insertId;
  await db.insert(rolePermissions).values(defaultPermRows(roleId, canManage));
}

async function ensureRolesForGrades(
  companyId: number,
  grades: { grade: number; label?: string }[],
  _partial = false,
): Promise<void> {
  if (!grades.length) return;
  const existing = await db
    .select({ fivemGrade: companyRoles.fivemGrade })
    .from(companyRoles)
    .where(eq(companyRoles.companyId, companyId));
  const have = new Set(existing.map((r) => r.fivemGrade).filter((g): g is number => g !== null));
  for (const g of grades) {
    if (have.has(g.grade)) continue;
    await createRole(companyId, g.label ?? `Grade ${g.grade}`, g.grade, false);
  }
}

export function isManagerGrade(label: string | null | undefined): boolean {
  if (!label) return false;
  return /patron|boss|g[eé]rant|chief|\bchef\b|owner|dirigeant|directeur|pdg|responsable/i.test(label);
}

async function ensureCompanyForJob(job: JobDef, partial = false): Promise<number | null> {
  if (isUnemployedJob(job.name)) return null;
  const found = await db
    .select({ id: companies.id, managed: companies.managedByFivem })
    .from(companies)
    .where(eq(companies.fivemJob, job.name))
    .limit(1);
  if (found[0]) {
    if (!found[0].managed) return null;
    await ensureRolesForGrades(found[0].id, job.grades ?? [], partial);
    return found[0].id;
  }
  if (isUnemployedLabel(job.label)) return null;
  const slug = await uniqueSlug(slugify(job.label ?? job.name));
  let companyId: number;
  try {
    const inserted = await db
      .insert(companies)
      .values({ name: job.label ?? job.name, slug, fivemJob: job.name, managedByFivem: true });
    companyId = inserted[0].insertId;
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const again = await db
      .select({ id: companies.id, managed: companies.managedByFivem })
      .from(companies)
      .where(eq(companies.fivemJob, job.name))
      .limit(1);
    if (!again[0] || !again[0].managed) return null;
    await ensureRolesForGrades(again[0].id, job.grades ?? [], partial);
    return again[0].id;
  }
  await db
    .insert(companyModules)
    .values(MODULES.map((m) => ({ companyId, moduleKey: m.key, enabled: m.defaultEnabled })));
  await ensureRolesForGrades(companyId, job.grades?.length ? job.grades : [{ grade: 0, label: 'Employé' }], partial);
  return companyId;
}

async function roleIdForGrade(companyId: number, grade: number): Promise<number | null> {
  const exact = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.fivemGrade, grade)))
    .limit(1);
  if (exact[0]) return exact[0].id;
  const any = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(eq(companyRoles.companyId, companyId))
    .orderBy(companyRoles.rank)
    .limit(1);
  return any[0]?.id ?? null;
}

async function resolveSyncRole(currentRoleId: number | null, targetRoleId: number | null): Promise<number | null> {
  if (targetRoleId === null || currentRoleId === targetRoleId) return currentRoleId;
  if (currentRoleId === null) return targetRoleId;
  const cur = await db
    .select({ fivemGrade: companyRoles.fivemGrade })
    .from(companyRoles)
    .where(eq(companyRoles.id, currentRoleId))
    .limit(1);
  return cur[0] && cur[0].fivemGrade === null ? currentRoleId : targetRoleId;
}

async function upsertMembership(companyId: number, userId: number, roleId: number | null): Promise<void> {
  const existing = await db
    .select({ id: memberships.id, roleId: memberships.companyRoleId })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)))
    .limit(1);
  if (existing[0]) {
    const nextRoleId = await resolveSyncRole(existing[0].roleId, roleId);
    await db
      .update(memberships)
      .set({ active: true, companyRoleId: nextRoleId })
      .where(eq(memberships.id, existing[0].id));
    return;
  }
  try {
    await db.insert(memberships).values({ companyId, userId, companyRoleId: roleId });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const dup = await db
      .select({ id: memberships.id, roleId: memberships.companyRoleId })
      .from(memberships)
      .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)))
      .limit(1);
    if (dup[0]) {
      const nextRoleId = await resolveSyncRole(dup[0].roleId, roleId);
      await db
        .update(memberships)
        .set({ active: true, companyRoleId: nextRoleId })
        .where(eq(memberships.id, dup[0].id));
    }
  }
}

async function deactivateOtherFivemMemberships(userId: number, keepCompanyIds: number[], allowEmpty = false): Promise<void> {
  if (!keepCompanyIds.length && !allowEmpty) return;
  const rows = await db
    .select({ id: memberships.id, companyId: memberships.companyId })
    .from(memberships)
    .innerJoin(companies, eq(memberships.companyId, companies.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.active, true),
        eq(companies.managedByFivem, true),
        keepCompanyIds.length ? notInArray(memberships.companyId, keepCompanyIds) : undefined,
      ),
    );
  for (const r of rows) {
    await db.update(memberships).set({ active: false }).where(eq(memberships.id, r.id));
    await db
      .update(companyEmployees)
      .set({ active: false })
      .where(and(eq(companyEmployees.companyId, r.companyId), eq(companyEmployees.userId, userId)));
  }
}

async function upsertRoster(p: PlayerDef): Promise<void> {
  const values = {
    discordId: p.discord,
    identifier: p.identifier ?? null,
    name: (p.name ?? '').slice(0, 120),
    job: p.job.slice(0, 64),
    jobGrade: p.grade,
    online: p.online !== false,
  };
  const existing = await db
    .select({ id: fivemPlayers.id })
    .from(fivemPlayers)
    .where(eq(fivemPlayers.discordId, p.discord))
    .limit(1);
  if (existing[0]) {
    await db.update(fivemPlayers).set(values).where(eq(fivemPlayers.id, existing[0].id));
  } else {
    try {
      await db.insert(fivemPlayers).values(values);
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      await db.update(fivemPlayers).set(values).where(eq(fivemPlayers.discordId, p.discord));
    }
  }
}

async function syncPlayer(p: PlayerDef): Promise<void> {
  await upsertRoster(p);
  const row = await db
    .select({ sel: fivemPlayers.selectedChar })
    .from(fivemPlayers)
    .where(eq(fivemPlayers.discordId, p.discord))
    .limit(1);
  if (row[0]?.sel) return;
  const userId = await resolveUserId(p.discord, p.name ?? p.discord);
  const comp = await db
    .select({ id: companies.id, managed: companies.managedByFivem })
    .from(companies)
    .where(and(eq(companies.fivemJob, p.job), isNull(companies.deletedAt)))
    .limit(1);
  const targetCompanyId = comp[0]?.managed ? comp[0].id : null;
  await deactivateOtherFivemMemberships(userId, targetCompanyId !== null ? [targetCompanyId] : [], isUnemployedJob(p.job));
  if (targetCompanyId !== null) {
    const roleId = await roleIdForGrade(targetCompanyId, p.grade);
    await upsertMembership(targetCompanyId, userId, roleId);
  }
}

export async function applySync(payload: SyncPayload): Promise<{ players: number; jobs: number }> {
  const jobs = payload.jobs ?? [];
  for (const j of jobs) await ensureCompanyForJob(j);
  const players = payload.players ?? [];
  for (const p of players) await syncPlayer(p);
  if (payload.full) {
    const present = new Set(players.map((p) => p.discord));
    const online = await db
      .select({ discordId: fivemPlayers.discordId })
      .from(fivemPlayers)
      .where(eq(fivemPlayers.online, true));
    for (const r of online) {
      if (!present.has(r.discordId)) {
        await db.update(fivemPlayers).set({ online: false }).where(eq(fivemPlayers.discordId, r.discordId));
      }
    }
  }
  return { players: players.length, jobs: jobs.length };
}

export interface SelectedChar {
  name: string;
  jobId: string;
  jobLabel?: string;
  grade: number;
  gradeLabel?: string;
}

function toSelected(c: GameChar): SelectedChar {
  return { name: c.name, jobId: c.jobId, jobLabel: c.jobLabel, grade: c.grade, gradeLabel: c.gradeLabel };
}

export async function saveCharacterList(discord: string, characters: GameChar[]): Promise<void> {
  const seen = new Set<string>();
  const rows = characters
    .map((c) => ({ ...c, name: (c.name || '—').slice(0, 120) }))
    .filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    })
    .map((c) => ({
      discordId: discord,
      name: c.name,
      jobId: c.jobId.slice(0, 64),
      jobLabel: c.jobLabel.slice(0, 120),
      grade: c.grade,
      gradeLabel: c.gradeLabel.slice(0, 120),
      unemployed: isUnemployedJob(c.jobId),
    }));
  if (!rows.length) {
    await db.delete(fivemCharacters).where(eq(fivemCharacters.discordId, discord));
    return;
  }
  await db
    .insert(fivemCharacters)
    .values(rows)
    .onDuplicateKeyUpdate({
      set: {
        jobId: sql`values(job_id)`,
        jobLabel: sql`values(job_label)`,
        grade: sql`values(grade)`,
        gradeLabel: sql`values(grade_label)`,
        unemployed: sql`values(unemployed)`,
      },
    });
  await db
    .delete(fivemCharacters)
    .where(and(eq(fivemCharacters.discordId, discord), notInArray(fivemCharacters.name, rows.map((r) => r.name))));
}

async function saveSelectedRoster(discord: string, char: SelectedChar | null): Promise<void> {
  const values = {
    discordId: discord,
    name: (char?.name ?? '').slice(0, 120),
    job: (char ? char.jobId : '').slice(0, 64),
    jobGrade: char?.grade ?? 0,
    selectedChar: char?.name ? char.name.slice(0, 120) : null,
    jobLabel: char?.jobLabel ? char.jobLabel.slice(0, 120) : null,
    gradeLabel: char?.gradeLabel ? char.gradeLabel.slice(0, 120) : null,
  };
  const existing = await db
    .select({ id: fivemPlayers.id })
    .from(fivemPlayers)
    .where(eq(fivemPlayers.discordId, discord))
    .limit(1);
  if (existing[0]) {
    await db.update(fivemPlayers).set(values).where(eq(fivemPlayers.id, existing[0].id));
    return;
  }
  try {
    await db.insert(fivemPlayers).values(values);
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    await db.update(fivemPlayers).set(values).where(eq(fivemPlayers.discordId, discord));
  }
}

export async function provisionAllCharacters(
  discord: string,
  characters: GameChar[],
  selectedName?: string | null,
): Promise<{ userId: number; companyIds: number[]; selectedCompanyId: number | null; selected: GameChar | null }> {
  const existing = await db
    .select({ s: fivemPlayers.selectedChar })
    .from(fivemPlayers)
    .where(eq(fivemPlayers.discordId, discord))
    .limit(1);
  const wanted = selectedName ?? existing[0]?.s ?? null;
  const selected =
    (wanted ? characters.find((c) => c.name === wanted) : undefined) ??
    characters.find((c) => !isUnemployedJob(c.jobId)) ??
    characters[0] ??
    null;

  const userId = await resolveUserId(discord, selected?.name || discord);
  await saveCharacterList(discord, characters);

  const keep: number[] = [];
  let selectedCompanyId: number | null = null;
  for (const c of characters) {
    if (isUnemployedJob(c.jobId)) continue;
    const companyId = await ensureCompanyForJob(
      { name: c.jobId, label: c.jobLabel, grades: [{ grade: c.grade, label: c.gradeLabel }] },
      true,
    );
    if (companyId === null) continue;
    const roleId = await roleIdForGrade(companyId, c.grade);
    await upsertMembership(companyId, userId, roleId);
    if (!keep.includes(companyId)) keep.push(companyId);
    if (selected && c.name === selected.name) selectedCompanyId = companyId;
  }
  await deactivateOtherFivemMemberships(userId, keep, characters.length > 0);
  await saveSelectedRoster(discord, selected ? toSelected(selected) : null);
  return { userId, companyIds: keep, selectedCompanyId, selected };
}

export type PullProvisionResult =
  | { ok: true; companyId: number | null; userId: number; job: string | null }
  | { ok: false; reason: 'invalid' | 'not_found' | 'unreachable' | 'unconfigured' | 'char_not_found' };

export async function pullAndProvision(discord: string, charName: string): Promise<PullProvisionResult> {
  const res = await fetchGameCharacters(discord);
  if (!res.ok) return { ok: false, reason: res.reason };
  const match = res.characters.find((c) => c.name === charName);
  if (!match) {
    await provisionAllCharacters(discord, res.characters);
    return { ok: false, reason: 'char_not_found' };
  }
  const out = await provisionAllCharacters(discord, res.characters, charName);
  return {
    ok: true,
    companyId: out.selectedCompanyId,
    userId: out.userId,
    job: isUnemployedJob(match.jobId) ? null : match.jobLabel,
  };
}

export async function refreshSelectedCharacter(discord: string): Promise<number | null> {
  const res = await fetchGameCharacters(discord);
  if (!res.ok) return null;
  const out = await provisionAllCharacters(discord, res.characters);
  return out.userId;
}

async function deactivateFivemMembershipsForDiscord(discord: string): Promise<number> {
  const u = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discord)).limit(1);
  if (!u[0]) return 0;
  const rows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(companies, eq(memberships.companyId, companies.id))
    .where(and(eq(memberships.userId, u[0].id), eq(memberships.active, true), eq(companies.managedByFivem, true)));
  for (const r of rows) await db.update(memberships).set({ active: false }).where(eq(memberships.id, r.id));
  return rows.length;
}

export async function refreshSelectedCharacters(): Promise<{ processed: number; userIds: number[]; departed: number }> {
  const rows = await db.select({ discordId: fivemPlayers.discordId }).from(fivemPlayers);
  const userIds: number[] = [];
  let departed = 0;
  for (const r of rows) {
    try {
      const res = await fetchGameCharacters(r.discordId);
      if (!res.ok) {
        continue;
      }
      const out = await provisionAllCharacters(r.discordId, res.characters);
      userIds.push(out.userId);
    } catch {
      continue;
    }
  }
  return { processed: rows.length, userIds, departed };
}

export async function resyncPlayer(
  discord: string,
): Promise<{ ok: true; count: number; userId: number | null } | { ok: false; reason: string }> {
  const res = await fetchGameCharacters(discord);
  if (!res.ok) return { ok: false, reason: res.reason };
  const out = await provisionAllCharacters(discord, res.characters);
  return { ok: true, count: res.characters.length, userId: out.userId };
}

export async function applyCharacterList(discord: string, characters: GameChar[]): Promise<number | null> {
  const out = await provisionAllCharacters(discord, characters);
  return out.userId;
}

export interface JobGradeLabels {
  jobLabel: (jobId: string, fallback?: string | null) => string;
  gradeLabel: (jobId: string, grade: number, fallback?: string | null) => string;
}

export async function resolveJobGradeLabels(
  chars: { jobId: string; grade: number }[],
): Promise<JobGradeLabels> {
  const jobIds = [...new Set(chars.map((c) => c.jobId).filter((j) => j && !isUnemployedJob(j)))];
  const comps = jobIds.length
    ? await db
        .select({ id: companies.id, name: companies.name, fivemJob: companies.fivemJob })
        .from(companies)
        .where(and(inArray(companies.fivemJob, jobIds), isNull(companies.deletedAt)))
    : [];
  const jobToCompany = new Map(comps.filter((c) => c.fivemJob).map((c) => [c.fivemJob as string, c]));
  const compIds = comps.map((c) => c.id);
  const roles = compIds.length
    ? await db
        .select({ companyId: companyRoles.companyId, fivemGrade: companyRoles.fivemGrade, name: companyRoles.name })
        .from(companyRoles)
        .where(inArray(companyRoles.companyId, compIds))
    : [];
  const roleMap = new Map(roles.filter((r) => r.fivemGrade != null).map((r) => [`${r.companyId}:${r.fivemGrade}`, r.name]));

  const cleanLabel = (v: string | null | undefined) =>
    v && v.toLowerCase() !== 'unemployed' && v.toLowerCase() !== 'unknown' ? v : null;

  return {
    jobLabel: (jobId, fallback) => jobToCompany.get(jobId)?.name ?? cleanLabel(fallback) ?? jobId,
    gradeLabel: (jobId, grade, fallback) => {
      const comp = jobToCompany.get(jobId);
      if (comp) {
        const n = cleanLabel(roleMap.get(`${comp.id}:${grade}`));
        if (n) return n;
      }
      return cleanLabel(fallback) ?? `Grade ${grade}`;
    },
  };
}
