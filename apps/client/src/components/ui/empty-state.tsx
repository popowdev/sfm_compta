import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/60" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
