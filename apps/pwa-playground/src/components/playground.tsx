import { GestureZone } from '@kstackz/use-gesture';
import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useId } from 'react';

const FRAME =
  'grid overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]';

/**
 * The live part of a page: a Stage on top, then Controls and Values side by
 * side. Keep it to one idea: a handful of controls, a handful of values.
 *
 * `gestures` makes it a trapped Gesture Zone, so touches on it are the
 * demo's alone, never the app's swipe or pull. Hooks that read them must
 * render inside it. Controls and Values opt out, so the page still scrolls
 * from there and a second finger can flip a control mid-gesture.
 */
export function Playground(props: {
  readonly children: ReactNode;
  readonly gestures?: boolean;
  readonly testId?: string;
}) {
  return props.gestures === true ? (
    <GestureZone
      trapped
      role="region"
      aria-label="Playground"
      data-testid={props.testId}
      className={FRAME}
    >
      {props.children}
    </GestureZone>
  ) : (
    <section
      aria-label="Playground"
      data-testid={props.testId}
      className={FRAME}
    >
      {props.children}
    </section>
  );
}

/** Where the demo runs. */
export function Stage(props: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      data-stage=""
      className={cn(
        'relative flex min-h-72 flex-col items-center justify-center gap-4 overflow-hidden bg-muted/30 p-4 sm:p-6 md:col-span-2',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

/** The knobs: a few Segmented choices, Toggles and buttons. */
export function Controls(props: { readonly children: ReactNode }) {
  return (
    <div
      data-zone-gesture="disabled"
      className="flex flex-col gap-4 border-t border-border p-4 sm:p-5"
    >
      <h3 className="sr-only">Controls</h3>
      {props.children}
    </div>
  );
}

/** Live readouts, always the same width, so nothing jumps as they change. */
export function Values(props: { readonly children: ReactNode }) {
  return (
    // Straight after the Stage (no Controls), it takes the whole row.
    <div
      data-zone-gesture="disabled"
      className="flex flex-col gap-2 border-t border-border bg-muted/20 p-4 sm:p-5 md:border-l md:[[data-stage]+&]:col-span-2 md:[[data-stage]+&]:border-l-0"
    >
      <h3 className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Live
      </h3>
      <dl className="flex flex-col gap-1.5">{props.children}</dl>
    </div>
  );
}

export function Value(props: {
  readonly label: string;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{props.label}</dt>
      <dd
        data-testid={props.testId}
        className="min-w-0 text-right font-mono text-[13px] tabular-nums [overflow-wrap:anywhere]"
      >
        {props.children}
      </dd>
    </div>
  );
}

/** A row of options, one chosen: native radios, so arrow keys work. */
export function Segmented<T extends string | number>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
  readonly onChange: (value: T) => void;
  readonly testId?: string;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm text-muted-foreground">
        {props.label}
      </legend>
      <div
        data-testid={props.testId}
        className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {props.options.map((option) => (
          <label
            key={String(option.value)}
            className="relative flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 select-none hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-xs has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring pointer-coarse:min-h-11"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={option.value === props.value}
              onChange={() => props.onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly testId?: string;
}) {
  return (
    <label className="flex min-h-9 w-fit cursor-pointer items-center gap-3 text-sm pointer-coarse:min-h-11">
      <Switch
        checked={props.checked}
        onCheckedChange={props.onChange}
        data-testid={props.testId}
      />
      {props.label}
    </label>
  );
}

/** Buttons that act on the demo. Put the one that matters first. */
export function Actions(props: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 [&>button]:min-h-10 pointer-coarse:[&>button]:min-h-11">
      {props.children}
    </div>
  );
}
