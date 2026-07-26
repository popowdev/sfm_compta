import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {from}–{to} sur <span className="font-medium text-foreground">{total}</span>
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
          Précédent
        </Button>
        <span className="tabular-nums text-muted-foreground">
          Page {page} / {pages}
        </span>
        <Button variant="outline" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Suivant
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
