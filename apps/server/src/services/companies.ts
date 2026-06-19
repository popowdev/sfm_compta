import { eq } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema';

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base || 'entreprise';
}

export async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  for (;;) {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, slug))
      .limit(1);
    if (!existing[0]) return slug;
    slug = `${base}-${i++}`;
  }
}
