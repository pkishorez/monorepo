import type { Ref } from 'react';
import { cn } from '#lib/utils';
import type { Inspection } from '../engine';
import type { Environment } from '../environment';
import type { GestureEvent, RecognizerState } from '../recognizers';
import type { EdgeStrips } from '../zone';
import { describeGesture } from './describe';

export type LogEntry = { readonly id: number; readonly event: GestureEvent };

const STATE_DOT: Record<RecognizerState, string> = {
  possible: 'bg-muted-foreground/40',
  began: 'bg-chart-8',
  changed: 'bg-chart-8',
  ended: 'bg-positive',
  cancelled: 'bg-chart-7',
  failed: 'bg-destructive/60',
};

function States(props: {
  readonly states: Inspection['states'];
  readonly claimed: Inspection['claimed'];
}) {
  return (
    <ul className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-0.5">
      {props.states.map(({ kind, state }) => (
        <li
          key={kind}
          data-testid={`gesture-overlay-state-${kind}`}
          data-state={state}
          className={cn(
            'flex min-w-0 items-center gap-1.5',
            state === 'failed' && 'text-muted-foreground',
            props.claimed === kind && 'font-semibold text-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              STATE_DOT[state],
              props.claimed === kind && 'ring-2 ring-chart-8/40',
            )}
          />
          <span className="truncate">{kind}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {state}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Log(props: { readonly entries: ReadonlyArray<LogEntry> }) {
  if (props.entries.length === 0) {
    return <p className="text-muted-foreground">No gestures yet.</p>;
  }
  return (
    <ol data-testid="gesture-overlay-log" className="flex flex-col gap-0.5">
      {props.entries.map(({ id, event }) => (
        <li key={id} className="flex flex-wrap gap-x-2">
          <span
            className={cn(
              'font-semibold',
              event.phase === 'cancelled' && 'text-chart-7',
            )}
          >
            {event.kind}
            {event.phase === 'cancelled' ? ' cancelled' : ''}
          </span>
          {describeGesture(event).map(([label, value]) => (
            <span key={label} className="text-muted-foreground">
              {label} <span className="text-foreground">{value}</span>
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** The overlay's readout: Environment, every recognizer's state, the live gesture and the log. */
export function Panel(props: {
  readonly environment: Environment;
  readonly strips: EdgeStrips | undefined;
  readonly states: Inspection['states'];
  readonly claimed: Inspection['claimed'];
  readonly ignoring: boolean;
  readonly log: ReadonlyArray<LogEntry>;
  readonly liveRef: Ref<HTMLParagraphElement>;
}) {
  const { environment, strips } = props;
  return (
    <section
      aria-label="Gesture debug overlay"
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex max-h-[32svh] flex-col gap-2 overflow-hidden rounded-lg bg-background/90 p-2.5 font-mono text-[11px] leading-snug text-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm sm:left-auto sm:w-96"
    >
      <header
        data-testid="gesture-overlay-environment"
        className="flex shrink-0 flex-wrap gap-x-2 text-muted-foreground"
      >
        <span className="text-foreground">{environment.platform}</span>
        <span>{environment.display}</span>
        <span>{environment.viewport}</span>
        {environment.reducedMotion ? <span>reduced motion</span> : null}
        {strips === undefined ? null : (
          <span>
            edges {strips.left.owner} {strips.left.width}px
          </span>
        )}
        <span data-testid="gesture-overlay-claimed">
          claimed{' '}
          <span className="text-foreground">{props.claimed ?? 'none'}</span>
        </span>
        {props.ignoring ? (
          <span className="text-chart-7">ignoring touch</span>
        ) : null}
      </header>
      <States states={props.states} claimed={props.claimed} />
      <p
        ref={props.liveRef}
        data-testid="gesture-overlay-live"
        className="shrink-0 truncate border-t border-border pt-1.5 text-muted-foreground tabular-nums"
      >
        Touch the zone.
      </p>
      <div className="min-h-0 overflow-hidden tabular-nums">
        <Log entries={props.log} />
      </div>
    </section>
  );
}
