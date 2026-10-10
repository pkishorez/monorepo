import type { ReactNode } from 'react';
import { ArrowRight } from '#lib/lucide';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import type { Field } from '../step/index.ts';

/** A value on one line: strings quoted, the rest as JSON. */
export const preview = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/** The color for a kind of value, as code is colored. */
export const colorOf = (value: unknown): string =>
  typeof value === 'string'
    ? 'text-positive'
    : typeof value === 'number' || typeof value === 'bigint'
      ? 'text-chart-8'
      : typeof value === 'boolean'
        ? 'text-chart-9'
        : value instanceof Date
          ? 'text-chart-7'
          : value === null || value === undefined
            ? 'text-muted-foreground'
            : 'text-foreground';

/** A value in full, wrapped, never cut off. */
export const Value = ({
  value,
  className,
}: {
  readonly value: unknown;
  /** Replaces the color of its kind. */
  readonly className?: string;
}) => (
  <span
    className={`min-w-0 font-mono break-all whitespace-pre-wrap ${className ?? colorOf(value)}`}
  >
    {preview(value)}
  </span>
);

/** Something lit, telling what it was before only on hover. */
export const Was = ({
  before,
  children,
}: {
  readonly before: ReactNode;
  readonly children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <span className="min-w-0 cursor-default rounded-sm bg-primary/10 px-1 underline decoration-muted-foreground/50 decoration-dotted underline-offset-2" />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent className="max-w-sm flex-col items-start gap-0.5">
      {before}
    </TooltipContent>
  </Tooltip>
);

/** A field's new value, lit; its old one on hover. A removed field is struck through. */
export const Diff = ({ field }: { readonly field: Field }) =>
  field.kind === 'removed' ? (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <Value
        value={field.before}
        className="text-muted-foreground line-through decoration-muted-foreground/60"
      />
      <span className="shrink-0 text-[11px] text-muted-foreground">
        removed
      </span>
    </span>
  ) : (
    <Was
      before={
        field.kind === 'added' ? (
          <span>Added by this Step</span>
        ) : (
          <>
            <span className="text-[10px] tracking-wide uppercase opacity-60">
              Before
            </span>
            <span className="font-mono break-all">{preview(field.before)}</span>
          </>
        )
      }
    >
      <Value value={field.after} />
    </Was>
  );

/** One State to another: the one left in red, the one entered in green. */
export const Move = ({
  from,
  to,
}: {
  readonly from: string;
  readonly to: string;
}) => (
  <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[11px]">
    <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 text-destructive">
      {from}
    </span>
    <ArrowRight aria-label="to" className="size-3.5 text-primary" />
    <span className="rounded-full border border-positive/50 bg-positive/10 px-2 text-positive">
      {to}
    </span>
  </span>
);
