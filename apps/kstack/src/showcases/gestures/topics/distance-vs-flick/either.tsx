import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { type MotionValue, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const DISTANCE = 80;
const VELOCITY = 500;

/** A live value on a bar, with a line where it would Commit. */
function Meter(props: {
  readonly label: string;
  readonly value: MotionValue<number>;
  readonly unit: string;
  readonly max: number;
  readonly threshold: number;
}) {
  const scaleX = useTransform(props.value, [0, props.max], [0, 1], {
    clamp: true,
  });
  const text = useTransform(
    props.value,
    (v) => `${Math.round(v)} ${props.unit}`,
  );
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{props.label}</span>
        <motion.span className="font-mono tabular-nums">{text}</motion.span>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        <motion.div
          className="h-full origin-left rounded-full bg-primary"
          style={{ scaleX }}
        />
        <div
          className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
          style={{ left: `${(props.threshold / props.max) * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A Swipe right with the default CommitRule: 80px or 500px/s at release,
 * either one. A slow drag commits by distance, a short flick by velocity.
 */
export function Either() {
  const [last, setLast] = useState<string>();
  const swipe = useSwipe({
    direction: 'right',
    commit: { distance: DISTANCE, velocity: VELOCITY },
    onCommit: ({ offset, velocity }) =>
      setLast(
        `Committed by ${offset >= DISTANCE ? 'distance' : 'velocity'} · ${Math.round(offset)}px, ${Math.round(velocity)}px/s`,
      ),
    onCancel: (reason, at) =>
      setLast(
        at
          ? `Cancelled: ${reason} · ${Math.round(at.offset)}px, ${Math.round(at.velocity)}px/s`
          : `Cancelled: ${reason}`,
      ),
  });
  useStageStatus(swipe.state === 'tracking' ? 'Tracking right' : last);
  const hint = useTransform(swipe.willCommit, (commit) => (commit ? 1 : 0.3));

  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-5 px-6">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-5">
        <Meter
          label="Offset"
          value={swipe.offset}
          unit="px"
          max={240}
          threshold={DISTANCE}
        />
        <Meter
          label="Velocity"
          value={swipe.velocity}
          unit="px/s"
          max={1500}
          threshold={VELOCITY}
        />
        <motion.p
          className="text-center text-sm font-medium"
          style={{ opacity: hint }}
        >
          Release to commit
        </motion.p>
      </div>
    </div>
  );
}
