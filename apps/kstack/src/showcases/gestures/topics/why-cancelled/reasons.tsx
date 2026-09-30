import { type SwipeCancel, useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

type Outcome = {
  readonly id: number;
  readonly reason: SwipeCancel | 'committed';
};

const MEANING: Record<Outcome['reason'], string> = {
  committed: 'It counted',
  direction: 'The touch first moved another way',
  fingers: 'Wrong number of fingers',
  short: 'Not far or fast enough',
  interrupted: 'The browser took the touch',
};

/**
 * A Swipe right that shows why the last one ended, big, over the last few
 * outcomes.
 */
export function Reasons() {
  const [outcomes, setOutcomes] = useState<ReadonlyArray<Outcome>>([]);
  const add = (reason: Outcome['reason']) =>
    setOutcomes((all) =>
      [{ id: (all[0]?.id ?? 0) + 1, reason }, ...all].slice(0, 5),
    );
  const swipe = useSwipe({
    direction: 'right',
    onCommit: () => add('committed'),
    onCancel: (reason) => add(reason),
  });
  const [last, ...before] = outcomes;
  useStageStatus(
    swipe.state === 'tracking'
      ? 'Tracking right'
      : last &&
          (last.reason === 'committed'
            ? 'Committed'
            : `Cancelled: ${last.reason}`),
  );

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-4">
      {last ? (
        <motion.div
          key={last.id}
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <span className="text-4xl font-semibold tracking-tight">
            {last.reason}
          </span>
          <span className="text-sm text-muted-foreground">
            {MEANING[last.reason]}
          </span>
        </motion.div>
      ) : (
        <span className="text-sm text-muted-foreground">Swipe right</span>
      )}
      <ul className="flex flex-col items-center gap-1 font-mono text-xs text-muted-foreground">
        {before.map((outcome) => (
          <li key={outcome.id}>{outcome.reason}</li>
        ))}
      </ul>
    </div>
  );
}
