import { Link } from '@tanstack/react-router';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from 'kui-toolkit/components/ui/card';
import { ArrowLeftIcon, ArrowRightIcon } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import type { ReactNode } from 'react';
import { scenarioAt, scenarios } from '../lib/scenarios.ts';

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

function PrevNext(props: { readonly path: string }) {
  const index = scenarios.findIndex((s) => s.path === props.path);
  if (index === -1) return null;
  const prev = scenarios[index - 1];
  const next = scenarios[index + 1];
  const linkClass =
    'group flex min-h-16 flex-col justify-center gap-0.5 rounded-lg px-4 py-3 ring-1 ring-foreground/10 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  return (
    <nav
      aria-label="More scenarios"
      className="mt-6 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
    >
      {prev ? (
        <Link to={prev.path} className={linkClass} data-testid="scenario-prev">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            Previous
          </span>
          <span className="text-sm font-medium">{prev.title}</span>
        </Link>
      ) : (
        <Link to="/" className={linkClass} data-testid="scenario-prev">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            Back to
          </span>
          <span className="text-sm font-medium">Overview</span>
        </Link>
      )}
      {next ? (
        <Link
          to={next.path}
          className={cn(linkClass, 'sm:items-end sm:text-right')}
          data-testid="scenario-next"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Next
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="text-sm font-medium">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * One scenario: what it proves and how to try it, then the live panels.
 * `data-page` gives it the `page` view-transition name (styles.css).
 */
export function ScenarioPage(props: {
  readonly id: string;
  readonly title: string;
  readonly proves: ReactNode;
  readonly steps?: ReadonlyArray<ReactNode>;
  readonly children: ReactNode;
}) {
  const path = `/${props.id}`;
  const scenario = scenarioAt(path);
  return (
    <main
      data-testid={`scenario-${props.id}`}
      data-page
      className="flex min-w-0 flex-col gap-8 pt-8 pb-16 lg:pt-10"
    >
      <header className="flex max-w-[65ch] flex-col gap-3">
        {scenario ? (
          <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
            {scenario.group}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-[2rem] sm:leading-tight">
          {props.title}
        </h1>
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {props.proves}
        </div>
      </header>

      {props.steps && props.steps.length > 0 ? (
        <section
          aria-labelledby={`${props.id}-try`}
          className="rounded-xl bg-muted/40 p-5 ring-1 ring-foreground/5"
        >
          <h2
            id={`${props.id}-try`}
            className="mb-3 text-sm font-medium text-foreground"
          >
            Try this
          </h2>
          <ol className="flex max-w-[70ch] flex-col gap-2.5 text-sm leading-relaxed">
            {props.steps.map((step, i) => (
              <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-2">
                <span
                  aria-hidden="true"
                  className="mt-px font-mono text-xs leading-relaxed text-muted-foreground tabular-nums"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-col gap-4">{props.children}</div>

      <PrevNext path={path} />
    </main>
  );
}

/** A live panel: title, optional hint, where it stands, then evidence and controls. */
export function Panel(props: {
  readonly title: string;
  readonly description?: string;
  readonly outcome?: Outcome;
  readonly outcomeLabel?: string;
  readonly outcomeTestId?: string;
  readonly children: ReactNode;
}) {
  return (
    <Card className="gap-4 [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="font-mono text-[15px]">{props.title}</CardTitle>
        {props.description === undefined ? null : (
          <CardDescription className="max-w-[65ch] text-pretty">
            {props.description}
          </CardDescription>
        )}
        {props.outcome === undefined ? null : (
          <CardAction>
            <OutcomeChip
              outcome={props.outcome}
              label={props.outcomeLabel}
              testId={props.outcomeTestId}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {props.children}
      </CardContent>
    </Card>
  );
}

/** A labelled live value; `testId` is what browser automation reads. */
export function Readout(props: {
  readonly label: string;
  readonly testId: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-3">
      <dt className="text-xs text-muted-foreground sm:text-sm">
        {props.label}
      </dt>
      <dd
        data-testid={props.testId}
        className="font-mono text-[13px] tabular-nums [overflow-wrap:anywhere]"
      >
        {props.value}
      </dd>
    </div>
  );
}

/** The evidence block: readouts on an inset surface, apart from the controls. */
export function Readouts(props: { readonly children: ReactNode }) {
  return (
    <dl className="flex flex-col divide-y divide-border rounded-lg bg-muted/40 px-3.5 py-3 ring-1 ring-foreground/5">
      {props.children}
    </dl>
  );
}

export function Actions(props: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 [&>button]:min-h-11 [&>button]:touch-manipulation sm:[&>button]:min-h-9">
      {props.children}
    </div>
  );
}
