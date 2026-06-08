import { useState, type ReactNode } from 'react';

import { Button } from '#components/ui/button';

interface RevealMoreProps<T> {
  /** Full set of items; only the first `step` are shown initially. */
  items: readonly T[];
  /** How many to reveal per click (and how many show initially). Default 5. */
  step?: number;
  /** Render a single item. */
  children: (item: T, index: number) => ReactNode;
  /** Stable key for an item. */
  itemKey: (item: T, index: number) => string;
}

/**
 * Renders a capped list (5±2 rule) and a "Show more" affordance that reveals
 * the next batch, so a long list never overwhelms at once.
 */
export function RevealMore<T>({
  items,
  step = 5,
  children,
  itemKey,
}: RevealMoreProps<T>) {
  const [visible, setVisible] = useState(step);
  const shown = items.slice(0, visible);
  const remaining = items.length - shown.length;

  return (
    <div className="flex flex-col gap-3">
      {shown.map((item, i) => (
        <div key={itemKey(item, i)}>{children(item, i)}</div>
      ))}
      {remaining > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={() => setVisible((v) => v + step)}
        >
          Show {Math.min(remaining, step)} more
          <span className="ml-1 text-xs">({remaining} hidden)</span>
        </Button>
      )}
    </div>
  );
}
