import { and, eq } from 'drizzle-orm';
import { moduleConfigNumber } from '@rp-compta/shared';
import { db } from '../db';
import { companyModules, wznArticles } from '../db/schema';

export interface WznConfig {
  priceVideo: number;
  priceEcrit: number;
  priceLike: number;
  weeks: number;
}

export interface WznArticleWeek {
  id: number;
  title: string;
  type: 'video' | 'ecrit';
  likes: number;
  active: boolean;
  startWeek: string;
  weeks: number;
  endWeek: string;
  weekIndex: number;
  base: number;
  likesAmount: number;
  amount: number;
  counted: boolean;
}

export function addWeeks(monday: string, n: number): string {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export async function wznConfig(companyId: number): Promise<WznConfig> {
  const rows = await db
    .select({ config: companyModules.config })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, companyId), eq(companyModules.moduleKey, 'wzn')));
  const raw = rows[0]?.config;
  const cfg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
  return {
    priceVideo: moduleConfigNumber(cfg, 'wzn', 'priceVideo'),
    priceEcrit: moduleConfigNumber(cfg, 'wzn', 'priceEcrit'),
    priceLike: moduleConfigNumber(cfg, 'wzn', 'priceLike'),
    weeks: Math.max(1, Math.round(moduleConfigNumber(cfg, 'wzn', 'weeks'))),
  };
}

export async function wznWeek(
  companyId: number,
  weekMonday: string,
): Promise<{ config: WznConfig; articles: WznArticleWeek[]; total: number }> {
  const config = await wznConfig(companyId);
  const rows = await db.select().from(wznArticles).where(eq(wznArticles.companyId, companyId));
  const articles = rows
    .map((a) => {
      const weeks = Math.max(1, a.weeks);
      const endWeek = addWeeks(a.startWeek, weeks - 1);
      const inWindow = weekMonday >= a.startWeek && weekMonday <= endWeek;
      const base = a.type === 'video' ? config.priceVideo : config.priceEcrit;
      const likesAmount = Math.max(0, a.likes) * config.priceLike;
      const counted = a.active && inWindow;
      const idx =
        Math.round((Date.parse(`${weekMonday}T12:00:00Z`) - Date.parse(`${a.startWeek}T12:00:00Z`)) / 604800000) + 1;
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        likes: a.likes,
        active: a.active,
        startWeek: a.startWeek,
        weeks,
        endWeek,
        weekIndex: idx,
        base,
        likesAmount,
        amount: counted ? base + likesAmount : 0,
        counted,
      };
    })
    .sort((x, y) => (y.counted ? 1 : 0) - (x.counted ? 1 : 0) || y.startWeek.localeCompare(x.startWeek) || y.id - x.id);
  return { config, articles, total: articles.reduce((s, a) => s + a.amount, 0) };
}

export async function wznRevenue(companyId: number, weekMonday: string): Promise<number> {
  const { total } = await wznWeek(companyId, weekMonday);
  return total;
}
