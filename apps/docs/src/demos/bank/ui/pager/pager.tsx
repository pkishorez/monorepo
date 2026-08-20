import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { cn } from '@monorepo/frontend/lib/utils';

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-hidden={pages <= 1}
      className={cn(
        'flex h-8 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground',
        pages <= 1 && 'invisible',
      )}
    >
      <Button
        size="icon"
        variant="ghost"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="size-7"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="w-10 text-center tabular-nums">
        {page + 1} / {Math.max(pages, 1)}
      </span>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Next page"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
        className="size-7"
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
