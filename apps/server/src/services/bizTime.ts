import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

export const BIZ_TZ = 'Europe/Paris';

export function bizDate(col: AnyColumn | SQL): SQL {
  return sql`DATE(CONVERT_TZ(${col}, '+00:00', 'Europe/Paris'))`;
}

export function bizDayStr(col: AnyColumn | SQL): SQL<string> {
  return sql<string>`DATE_FORMAT(CONVERT_TZ(${col}, '+00:00', 'Europe/Paris'), '%Y-%m-%d')`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const ymd = (utcMidnight: Date): string => utcMidnight.toISOString().slice(0, 10);

const PARIS_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BIZ_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PARIS_DATETIME_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BIZ_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsOf(fmt: Intl.DateTimeFormat, date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

export function bizDateParts(date: Date = new Date()): { year: number; month: number; day: number } {
  const p = partsOf(PARIS_DATE_FMT, date);
  return { year: Number(p.year ?? '0'), month: Number(p.month ?? '0'), day: Number(p.day ?? '0') };
}

export function bizNowParts(): { year: number; month: number; day: number; dow: number } {
  const { year, month, day } = bizDateParts(new Date());
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, dow };
}

export function bizToday(base: Date = new Date()): string {
  const { year, month, day } = bizDateParts(base);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function weekLabel(monday: Date, sunday: Date): string {
  const fmt = (d: Date): string => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  return `Semaine du ${fmt(monday)} au ${fmt(sunday)}`;
}

export function bizWeek(
  base: Date = new Date(),
  offsetWeeks = 0,
): { monday: string; sunday: string; label: string } {
  const { year, month, day } = bizDateParts(base);
  const anchor = new Date(Date.UTC(year, month - 1, day + offsetWeeks * 7));
  const dow = anchor.getUTCDay();
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { monday: ymd(monday), sunday: ymd(sunday), label: weekLabel(monday, sunday) };
}

export function bizDayList(count: number, base: Date = new Date()): string[] {
  const { year, month, day } = bizDateParts(base);
  const list: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    list.push(ymd(new Date(Date.UTC(year, month - 1, day - i))));
  }
  return list;
}

export function bizWallMs(instant: Date): number {
  const p = partsOf(PARIS_DATETIME_FMT, instant);
  return Date.UTC(
    Number(p.year ?? '0'),
    Number(p.month ?? '1') - 1,
    Number(p.day ?? '1'),
    Number(p.hour ?? '0'),
    Number(p.minute ?? '0'),
    Number(p.second ?? '0'),
  );
}

export function bizOffsetMs(instant: Date): number {
  return bizWallMs(instant) - instant.getTime();
}

export function bizWallToUtc(parisWall: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(parisWall);
  if (!m) return parisWall;
  const wall = Date.UTC(
    Number(m[1] ?? '0'),
    Number(m[2] ?? '1') - 1,
    Number(m[3] ?? '1'),
    Number(m[4] ?? '0'),
    Number(m[5] ?? '0'),
    Number(m[6] ?? '0'),
  );
  let offset = bizOffsetMs(new Date(wall));
  offset = bizOffsetMs(new Date(wall - offset));
  const t = new Date(wall - offset);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())} ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}:${pad2(t.getUTCSeconds())}`;
}

function utcStrToDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(s);
  if (!m) return null;
  return new Date(
    Date.UTC(
      Number(m[1] ?? '0'),
      Number(m[2] ?? '1') - 1,
      Number(m[3] ?? '1'),
      Number(m[4] ?? '0'),
      Number(m[5] ?? '0'),
      Number(m[6] ?? '0'),
    ),
  );
}

export function bizPeakMinutes(inStr: string, outStr: string, peakStartHour = 21): number {
  const inUtc = utcStrToDate(inStr);
  const outUtc = utcStrToDate(outStr);
  if (!inUtc || !outUtc) return 0;
  const start = bizWallMs(inUtc);
  const end = bizWallMs(outUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const d = new Date(start);
  let day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let total = 0;
  for (; day < end; day += DAY) {
    const s = Math.max(start, day + peakStartHour * HOUR);
    const e = Math.min(end, day + DAY);
    if (e > s) total += (e - s) / 60_000;
  }
  return total;
}
