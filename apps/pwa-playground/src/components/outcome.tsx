import { cn } from '@kstackz/ui-toolkit/utils';

/** Where a check stands. Every panel shows one, so a glance says what happened. */
export type Outcome = 'idle' | 'running' | 'success' | 'failure';

const OUTCOME_LABEL: Record<Outcome, string> = {
  idle: 'Not run',
  running: 'Running',
  success: 'Passed',
  failure: 'Failed',
};

const OUTCOME_DOT: Record<Outcome, string> = {
  idle: 'bg-muted-foreground/50',
  running: 'bg-chart-7 motion-safe:animate-pulse',
  success: 'bg-positive',
  failure: 'bg-destructive',
};

/** Dot plus words, never colour alone. `label` overrides the default wording. */
export function OutcomeChip(props: {
  readonly outcome: Outcome;
  readonly label?: string;
  readonly testId?: string;
}) {
  return (
    <span
      data-testid={props.testId}
      data-outcome={props.outcome}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs whitespace-nowrap ring-1 ring-inset',
        props.outcome === 'failure'
          ? 'bg-destructive/10 text-destructive ring-destructive/20'
          : props.outcome === 'success'
            ? 'bg-positive/10 text-foreground ring-positive/25'
            : 'bg-muted/60 text-muted-foreground ring-foreground/10',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', OUTCOME_DOT[props.outcome])}
      />
      {props.label ?? OUTCOME_LABEL[props.outcome]}
    </span>
  );
}
