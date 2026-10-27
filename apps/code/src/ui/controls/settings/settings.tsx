import { cn } from '@kestack/web-platform/ui/components/utils';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useId } from 'react';

/*
 * Settings' own parts, the same in every tab: a tab's Title, a Section of
 * Rows under a quiet name, a Row of one setting, its name over a line of
 * what it does and its control beside them, a Choice of a few, and a
 * Toggle, on or off.
 * No cards and no shading: lines between Rows, and room between Sections.
 */

/** A tab's name, a line saying what it holds, and an action at its right. */
export function Title({
  id,
  name,
  action,
  children,
}: {
  readonly id: string;
  readonly name: string;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {name}
        </h2>
        {children === undefined ? null : (
          <p className="text-sm text-muted-foreground">{children}</p>
        )}
      </div>
      {action}
    </header>
  );
}

/** Rows under a quiet name, close together, each its own target. */
export function Section({
  name,
  action,
  className,
  children,
}: {
  readonly name: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={name}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <div className="flex min-h-6 items-center justify-between gap-4">
        <h3 className="text-xs font-medium text-muted-foreground">{name}</h3>
        {action}
      </div>
      {/* Out past the column by a Row's padding, so its words line up with the name above. */}
      <div className="-mx-3 flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

/**
 * One setting: its name over a line of what it does, its control beside.
 * With `onToggle`, the whole Row is the target: a click anywhere on it
 * does what its control does, and a click on the control itself is left
 * to it. The keyboard still works the control alone.
 */
export function Row({
  id,
  name,
  children,
  control,
  onToggle,
  className,
}: {
  readonly id: string;
  readonly name: ReactNode;
  readonly children?: ReactNode;
  readonly control?: ReactNode;
  readonly onToggle?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={`${id}-name`}
      onClick={
        onToggle === undefined
          ? undefined
          : (event) => {
              const target = event.target as Element;
              if (target.closest('button, a, input') === null) onToggle();
            }
      }
      className={cn(
        'flex items-center gap-6 rounded-lg px-3 py-2.5',
        onToggle !== undefined &&
          'cursor-pointer transition-colors duration-150 select-none hover:bg-muted/50',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={`${id}-name`} className="text-sm font-medium">
          {name}
        </span>
        {children === undefined ? null : (
          <span className="text-sm text-pretty text-muted-foreground">
            {children}
          </span>
        )}
      </div>
      {control === undefined ? null : (
        <div className="flex shrink-0 items-center">{control}</div>
      )}
    </div>
  );
}

/** One curve for what moves here: quick, settling without a bounce. */
const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const;

/**
 * One of a few, side by side, the one chosen raised on a pill that slides
 * to the next. Of two, clicking the one chosen chooses the other, so the
 * whole control is a toggle to a pointer; from the keys it is a radio
 * group, the arrow keys moving to the one beside.
 */
export function Choice<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: Value;
  readonly options: ReadonlyArray<{
    readonly value: Value;
    readonly label: ReactNode;
  }>;
  readonly onChange: (value: Value) => void;
}) {
  const pill = useId();
  const still = useReducedMotion() === true;
  const at = options.findIndex((option) => option.value === value);
  const choose = (index: number, pointer: boolean) => {
    // Of two, the one chosen clicked again is the other. From the keys it
    // stays chosen, as a radio does, so focus never sits on one unchosen.
    const next =
      index === at && options.length === 2 && pointer
        ? options[1 - at]
        : options[index];
    if (next !== undefined) onChange(next.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg bg-muted p-0.5"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const by = event.key === 'ArrowLeft' ? -1 : 1;
        const index = (at + by + options.length) % options.length;
        const next = options[index];
        if (next === undefined) return;
        onChange(next.value);
        event.currentTarget.querySelectorAll('button')[index]?.focus();
      }}
    >
      {options.map((option, index) => {
        const chosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            // A click from the keys has no detail; from a pointer, its count.
            onClick={(event) => choose(index, event.detail > 0)}
            className="focus-ring relative flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground aria-checked:text-foreground keyboard:h-7 keyboard:px-2.5 [&_svg]:size-3.5"
          >
            {chosen && (
              <motion.span
                layoutId={pill}
                transition={still ? { duration: 0 } : SPRING}
                className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-border/50"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * On or off: a quiet track that fills with the primary colour when on,
 * and a knob of the page's own colour in both, so only the track says
 * which; the knob springs across and stretches a little while pressed.
 */
export function Toggle({
  labelledBy,
  on,
  onChange,
}: {
  /** The id of what names it. */
  readonly labelledBy: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  const still = useReducedMotion() === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!on)}
      className="focus-ring group relative flex h-6 w-10 shrink-0 items-center rounded-full bg-foreground/20 p-0.5 transition-colors duration-200 ease-out after:absolute after:-inset-2 hover:bg-foreground/25 aria-checked:justify-end aria-checked:bg-primary aria-checked:hover:bg-primary/90 keyboard:h-5 keyboard:w-8"
    >
      <motion.span
        layout
        transition={still ? { duration: 0 } : SPRING}
        className="block size-5 rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[width] duration-150 group-active:w-6 keyboard:size-4 keyboard:group-active:w-5"
      />
    </button>
  );
}
