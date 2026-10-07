import { Button } from '@kstackz/web-toolkit/components/button';
import type { ReactNode } from 'react';

/** A part of Settings under its heading. */
export function Section(props: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{props.title}</h2>
      {props.children}
    </section>
  );
}

/** One setting: what it is, and its control. */
export function Row(props: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1">
      <span className="grid min-w-0">
        <span className="text-sm">{props.label}</span>
        {props.hint && (
          <span className="text-xs text-pretty text-muted-foreground">
            {props.hint}
          </span>
        )}
      </span>
      {props.children}
    </div>
  );
}

type FlipOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
};

/** One of two, showing the one chosen: a tap changes it to the other, in place. */
export function Flip<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly [FlipOption<T>, FlipOption<T>];
  readonly onChange: (value: T) => void;
}) {
  const [first, second] = props.options;
  const [chosen, other] =
    props.value === first.value ? [first, second] : [second, first];
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={`${props.label}: ${chosen.label}, change to ${other.label}`}
      onClick={() => props.onChange(other.value)}
      className="min-w-24 shrink-0"
    >
      {chosen.icon}
      {chosen.label}
    </Button>
  );
}
