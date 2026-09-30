import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  type LucideIcon,
} from '@kstackz/ui-toolkit/lucide';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/** An arrow that fills as its Swipe tracks, and turns solid once letting go would Commit. */
function Arrow(props: {
  readonly swipe: ReturnType<typeof useSwipe>;
  readonly Icon: LucideIcon;
  readonly className: string;
}) {
  const { progress, willCommit } = props.swipe;
  const opacity = useTransform(() =>
    willCommit.get() ? 1 : Math.min(progress.get(), 1) * 0.6,
  );
  return (
    <div
      className={`absolute grid size-12 place-items-center overflow-hidden rounded-full bg-muted ${props.className}`}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/20 ring-2 ring-primary ring-inset"
        style={{ opacity: props.swipe.state === 'tracking' ? opacity : 0 }}
      />
      <props.Icon className="relative size-5" aria-hidden="true" />
    </div>
  );
}

/**
 * Four Swipes, one per direction, hearing every Gesture. The first 10px pick
 * one; the other three Cancel with `direction`.
 */
export function FourWays() {
  const [last, setLast] = useState<string>();
  const on = (direction: string) => ({
    onCommit: () => setLast(`Committed ${direction}`),
    onCancel: (reason: string) =>
      reason !== 'direction' && setLast(`Cancelled ${direction}: ${reason}`),
  });
  const up = useSwipe({ direction: 'up', ...on('up') });
  const down = useSwipe({ direction: 'down', ...on('down') });
  const left = useSwipe({ direction: 'left', ...on('left') });
  const right = useSwipe({ direction: 'right', ...on('right') });
  const tracking = Object.entries({ up, down, left, right }).find(
    ([, swipe]) => swipe.state === 'tracking',
  )?.[0];
  useStageStatus(tracking ? `Tracking ${tracking}` : last);

  const hint = useTransform(() =>
    [up, down, left, right].some((swipe) => swipe.willCommit.get()) ? 1 : 0,
  );

  return (
    <div className="absolute inset-0">
      <Arrow
        swipe={up}
        Icon={ArrowUpIcon}
        className="top-4 left-1/2 -translate-x-1/2"
      />
      <Arrow
        swipe={down}
        Icon={ArrowDownIcon}
        className="bottom-4 left-1/2 -translate-x-1/2"
      />
      <Arrow
        swipe={left}
        Icon={ArrowLeftIcon}
        className="top-1/2 left-4 -translate-y-1/2"
      />
      <Arrow
        swipe={right}
        Icon={ArrowRightIcon}
        className="top-1/2 right-4 -translate-y-1/2"
      />
      <motion.p
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium"
        style={{ opacity: hint }}
      >
        Release to commit
      </motion.p>
    </div>
  );
}
