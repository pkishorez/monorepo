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
