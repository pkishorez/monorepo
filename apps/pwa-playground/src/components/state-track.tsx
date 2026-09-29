import { cn } from '@kstackz/ui-toolkit/utils';

export type TrackState = {
  readonly id: string;
  /** What the state means, shown while it is the current one. */
  readonly hint: string;
};

/**
 * Every state a thing can be in, the current one filled, and what it means
 * underneath. Reads as a state machine at a glance.
 */
export function StateTrack(props: {
  readonly states: ReadonlyArray<TrackState>;
  readonly current: string;
  readonly label: string;
  readonly testId?: string;
}) {
  const current = props.states.find((s) => s.id === props.current);
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <ol
        aria-label={props.label}
        data-testid={props.testId}
        data-state={props.current}
        className="flex flex-wrap justify-center gap-1.5"
      >
        {props.states.map((state) => {
          const on = state.id === props.current;
          return (
            <li
              key={state.id}
              aria-current={on ? 'step' : undefined}
              className={cn(
                'flex h-8 items-center rounded-full px-3 font-mono text-xs transition-colors duration-150',
                on
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground ring-1 ring-foreground/10',
              )}
            >
              {state.id}
            </li>
          );
        })}
      </ol>
      <p
        aria-live="polite"
        className="min-h-[3lh] max-w-[46ch] text-center text-sm leading-relaxed text-pretty text-muted-foreground"
      >
        {current?.hint ?? props.current}
      </p>
    </div>
  );
}
