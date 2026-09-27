import { Search } from 'lucide-react';

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Rechercher…'}
        aria-label={placeholder ?? 'Rechercher'}
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({
  value,
  onChange,
  options,
  allLabel = 'Tous',
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  allLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel ?? allLabel}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function distinctOptions(values: (string | null | undefined)[]): FilterOption[] {
  const set = new Set<string>();
  for (const v of values) if (v) set.add(v);
  return [...set].sort((a, b) => a.localeCompare(b, 'fr')).map((v) => ({ value: v, label: v }));
}
