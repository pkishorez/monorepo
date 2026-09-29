import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import type { ReactNode } from 'react';

/**
 * The Case's own switches, above its zones. They are marked disabled for
 * the zones, so a second finger can flip one in the middle of a Gesture
 * without joining it.
 */
export function Controls(props: { readonly children: ReactNode }) {
  return (
    <div
      data-zone-gesture="disabled"
      className="flex shrink-0 flex-wrap items-center gap-1.5"
    >
      {props.children}
    </div>
  );
}

export function Toggle(props: {
  readonly label: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <Button
      size="sm"
      variant={props.on ? 'default' : 'outline'}
      aria-pressed={props.on}
      onClick={() => props.onChange(!props.on)}
      className="font-mono text-xs"
    >
      {props.label}:
      <span className="inline-block w-[3ch] text-left">
        {props.on ? 'on' : 'off'}
      </span>
    </Button>
  );
}

export const Code = (props: { readonly children: ReactNode }) => (
  <code>{props.children}</code>
);

/** A row of fixed buttons, one per value; the chosen one is filled. */
export function Choice<T extends string | number>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs text-muted-foreground">
        {props.label}
      </span>
      {props.options.map((option) => (
        <Button
          key={option.label}
          size="sm"
          variant={option.value === props.value ? 'default' : 'outline'}
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
          className="min-w-10 font-mono text-xs"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
