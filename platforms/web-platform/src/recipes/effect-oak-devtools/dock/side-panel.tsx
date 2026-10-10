import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen } from '#lib/lucide';
import { Button } from '#components/ui/button';
import { drag } from './drag.ts';

/**
 * A panel at the right edge: dragging its edge, or the arrow keys on it,
 * resizes it, and it folds to a slim tab. `children` gets the button that
 * folds it, to place in its own header.
 */
export const SidePanel = ({
  label,
  folded,
  children,
}: {
  readonly label: string;
  readonly folded: ReactNode;
  readonly children: (fold: ReactNode) => ReactNode;
}) => {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(440);
  const clamp = (next: number) =>
    Math.min(Math.max(next, 300), window.innerWidth - 320);

  if (!open)
    return (
      <button
        type="button"
        aria-label={`Open ${label}`}
        onClick={() => setOpen(true)}
        className="flex w-9 shrink-0 flex-col items-center gap-3 border-l py-3 text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <PanelRightOpen className="size-4" />
        {folded}
      </button>
    );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setWidth(clamp(width + (event.key === 'ArrowLeft' ? 32 : -32)));
  };

  return (
    <aside
      aria-label={label}
      className="relative flex shrink-0 flex-col border-l bg-background"
      style={{ width }}
    >
      <div
        role="separator"
        aria-label={`Resize ${label}`}
        aria-orientation="vertical"
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          const from = width;
          drag(event, 'x', (by) => setWidth(clamp(from - by)));
        }}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 -left-1.5 z-10 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none"
      >
        <span className="h-10 w-1 rounded-full bg-border transition-colors duration-150 group-hover:bg-muted-foreground group-focus-visible:bg-primary group-active:bg-primary" />
      </div>
      {children(
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Close ${label}`}
          onClick={() => setOpen(false)}
        >
          <PanelRightClose />
        </Button>,
      )}
    </aside>
  );
};
