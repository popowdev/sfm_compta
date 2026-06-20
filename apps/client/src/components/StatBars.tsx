export interface BarItem {
  label: string;
  value: number;
  hint?: string;
}

export function BarList({
  items,
  unit = '',
  format = (v: number) => v.toLocaleString('fr-FR'),
  barClass = 'bg-primary/70',
  emptyLabel = 'Aucune donnée.',
}: {
  items: BarItem[];
  unit?: string;
  format?: (v: number) => string;
  barClass?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">
              {it.label}
              {it.hint && <span className="ml-2 text-xs text-muted-foreground">{it.hint}</span>}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {format(it.value)}
              {unit}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${barClass}`}
              style={{ width: `${Math.max((Math.abs(it.value) / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
