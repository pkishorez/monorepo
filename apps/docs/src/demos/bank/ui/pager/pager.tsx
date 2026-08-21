import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { cn } from '@monorepo/frontend/lib/utils';

const MAX_DOTS = 8;

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
        'flex h-8 shrink-0 items-center gap-0.5',
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
      {pages <= MAX_DOTS ? (
        <div className="flex items-center">
          {Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Page ${index + 1}`}
              aria-current={index === page || undefined}
              onClick={() => onPage(index)}
              className="flex size-4 items-center justify-center"
            >
              <span
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  index === page
                    ? 'bg-foreground'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/60',
                )}
              />
            </button>
          ))}
        </div>
      ) : (
        <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">
          {page + 1} / {pages}
        </span>
      )}
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
