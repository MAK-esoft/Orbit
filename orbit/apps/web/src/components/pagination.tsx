import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaginatedMeta } from '@/lib/types';
import { Button } from './ui/button';

export function Pagination({
  meta,
  onPage,
}: {
  meta: PaginatedMeta;
  onPage: (page: number) => void;
}) {
  if (meta.total === 0) return null;
  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-meta text-text-secondary">
        {start}–{end} of {meta.total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
