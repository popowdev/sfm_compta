const PARIS_DAY = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PARIS_PARTS = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function parisDay(date: Date = new Date()): string {
  return PARIS_DAY.format(date);
}

export function parisDateTime(date: Date = new Date()): string {
  const p = Object.fromEntries(PARIS_PARTS.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

function anchor(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function mondayOf(date: Date = new Date(), offsetWeeks = 0): string {
  const d = anchor(parisDay(date));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

export function weekRange(date: Date = new Date(), offsetWeeks = 0): { from: string; to: string } {
  const from = mondayOf(date, offsetWeeks);
  const sun = anchor(from);
  sun.setUTCDate(sun.getUTCDate() + 6);
  return { from, to: sun.toISOString().slice(0, 10) };
}

export function frDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

export function addDays(day: string, n: number): string {
  const d = anchor(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function parisStamp(date: Date = new Date()): string {
  return `${parisDateTime(date).replace('T', ' ')}:00`;
}

export function parisMidnight(date: Date = new Date()): Date {
  return new Date(`${parisDay(date)}T00:00:00`);
}
