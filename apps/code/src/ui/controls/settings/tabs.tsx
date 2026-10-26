import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactNode } from 'react';

/*
 * A row of tabs by name, the one open underlined: Settings' own, and a
 * Connection's Agents and Projects within it, drawn the same. Each tall
 * enough to tap on touch.
 */

/** The row the names sit in. */
export function TabList({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex shrink-0 gap-1', className)}
    >
      {children}
    </div>
  );
}

/** One tab's name, which opens it. */
export function Tab({
  id,
  controls,
  selected,
  onSelect,
  className,
  children,
}: {
  readonly id: string;
  /** The id of the tab's panel. */
  readonly controls: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      data-slot="tab"
      id={id}
      aria-selected={selected}
      aria-controls={controls}
      onClick={onSelect}
      className={cn(
        'focus-ring relative flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground aria-selected:text-foreground',
        'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 aria-selected:after:opacity-100',
        className,
      )}
    >
      {children}
    </button>
  );
}
