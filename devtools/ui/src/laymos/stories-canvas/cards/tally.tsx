import { ShieldAlert } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import { StateMark } from '../badges';
import { stateStyles } from '../state-style';
import { proofStates, type Tally } from '../story-scope';

/** The Proof states rolled up from everything beneath a Story, worst first. */
export function TallyLine({
  tally,
  className,
}: {
  readonly tally: Tally;
  readonly className?: string;
}) {
  if (tally.total === 0) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        No Proofs yet
      </span>
    );
  }
  const label = proofStates
    .filter((state) => tally.counts[state] > 0)
    .map(
      (state) =>
        `${tally.counts[state]} ${stateStyles[state].label.toLowerCase()}`,
    )
    .join(', ');
  return (
    <span
      aria-label={`${tally.total} Proofs: ${label}`}
      className={cn(
        'inline-flex min-w-0 items-center gap-2.5 text-xs',
        tally.criticalFailing && 'text-destructive',
        className,
      )}
    >
      {tally.criticalFailing && (
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
      )}
      {proofStates.map((state) =>
        tally.counts[state] === 0 ? null : (
          <span
            key={state}
            title={stateStyles[state].label}
            className={cn(
              'inline-flex items-center gap-1 font-medium tabular-nums',
              tally.criticalFailing ? 'text-destructive' : 'text-foreground/80',
              state === 'not-run' &&
                !tally.criticalFailing &&
                'text-muted-foreground',
            )}
          >
            <StateMark state={state} className="size-1.5 [&>span]:size-1.5" />
            {tally.counts[state]}
          </span>
        ),
      )}
    </span>
  );
}
