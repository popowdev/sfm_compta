import { eq } from 'drizzle-orm';
import { MODULES, type EffectiveModule, type ModuleKey } from '@rp-compta/shared';
import { db } from '../db';
import { moduleSettings } from '../db/schema';

export async function getEffectiveModules(): Promise<EffectiveModule[]> {
  const rows = await db.select().from(moduleSettings);
  const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
  return MODULES.map((m) => {
    const s = byKey.get(m.key);
    return {
      key: m.key,
      label: s?.label ?? m.label,
      group: s?.groupName ?? m.group,
      blocked: s?.blocked ?? false,
      defaultEnabled: m.defaultEnabled,
    };
  });
}

export async function isModuleBlocked(key: ModuleKey): Promise<boolean> {
  const rows = await db
    .select({ blocked: moduleSettings.blocked })
    .from(moduleSettings)
    .where(eq(moduleSettings.moduleKey, key))
    .limit(1);
  return rows[0]?.blocked ?? false;
}

export async function setModuleSettings(
  key: ModuleKey,
  patch: { label?: string | null; group?: string | null; blocked?: boolean },
): Promise<void> {
  const values = {
    moduleKey: key,
    label: patch.label ?? null,
    groupName: patch.group ?? null,
    blocked: patch.blocked ?? false,
  };
  await db
    .insert(moduleSettings)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.group !== undefined ? { groupName: patch.group } : {}),
        ...(patch.blocked !== undefined ? { blocked: patch.blocked } : {}),
      },
    });
}
