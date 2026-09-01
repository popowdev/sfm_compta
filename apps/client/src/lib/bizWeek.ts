const PARIS_DAY = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function parisDay(date: Date = new Date()): string {
  return PARIS_DAY.format(date);
}

function anchor(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function mondayOf(date: Date = new Date()): string {
  const d = anchor(parisDay(date));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function weekRange(date: Date = new Date()): { from: string; to: string } {
  const from = mondayOf(date);
  const sun = anchor(from);
  sun.setUTCDate(sun.getUTCDate() + 6);
  return { from, to: sun.toISOString().slice(0, 10) };
}
