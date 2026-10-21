import { VARIANTS } from './variant.ts';
import type { Variant } from './variant.ts';

/*
 * A small pill for the owner to flip between the page's two versions:
 * bottom right on a wide screen; on a phone, top right of the first
 * screen, scrolling away with it so it never sits over a shape.
 */

export function Switcher({
  variant,
  onChange,
}: {
  readonly variant: Variant;
  readonly onChange: (variant: Variant) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Page version"
      className="absolute top-[4.25rem] right-3 z-30 flex gap-0.5 rounded-full border border-border bg-background p-0.5 lg:fixed lg:top-auto lg:right-6 lg:bottom-6 lg:p-1"
    >
      {VARIANTS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={variant === option}
          onClick={() => onChange(option)}
          className="h-8 rounded-full px-3 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background motion-reduce:transition-none lg:px-4"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
