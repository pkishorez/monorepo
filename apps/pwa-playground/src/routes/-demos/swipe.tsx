import {
  type CommitRule,
  type Direction,
  useSwipe,
} from '@kstackz/use-gesture/recognizers';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
} from '@kstackz/ui-toolkit/lucide';
import {
  type AnimationPlaybackControls,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Controls,
  Segmented,
  Stage,
  Value,
  Values,
} from '../../components/index.ts';
import { oneOf } from '../../lib/search.ts';
import { Fingers, px } from './kit.tsx';

type Rule = 'either' | 'distance' | 'flick';

export type SwipeOptions = {
  readonly direction: Direction;
  readonly fingers: 1 | 2 | 3;
  readonly rule: Rule;
};

export const SWIPE_DEFAULTS: SwipeOptions = {
  direction: 'left',
  fingers: 1,
  rule: 'either',
};

/** Options from a URL's search params; anything unknown falls back. */
export const parseSwipe = (s: Record<string, unknown>): SwipeOptions => ({
  direction: oneOf(
    s['direction'],
    ['left', 'right', 'up', 'down'],
    SWIPE_DEFAULTS.direction,
  ),
  fingers: oneOf(s['fingers'], [1, 2, 3], SWIPE_DEFAULTS.fingers),
  rule: oneOf(s['rule'], ['either', 'distance', 'flick'], SWIPE_DEFAULTS.rule),
});

const RULES: Record<Rule, CommitRule> = {
  either: { distance: 80, velocity: 500 },
  distance: { distance: 80 },
  flick: { velocity: 500 },
};

const RULE_TEXT: Record<Rule, string> = {
  either: '{ distance: 80, velocity: 500 }, // the default',
  distance: '{ distance: 80 },',
  flick: '{ velocity: 500 }, // a flick',
};

export const swipeCode = (
  o: SwipeOptions,
) => `import { useSwipe } from '@kstackz/use-gesture/recognizers';

const swipe = useSwipe({
  direction: '${o.direction}',${o.fingers === 1 ? '' : `\n  fingers: ${o.fingers},`}
  commit: ${RULE_TEXT[o.rule]}
  onCommit: (release) => archive(), // { offset, velocity, projected }
  onCancel: (reason) => {},         // 'direction' | 'fingers' | 'short' | 'interrupted'
});

// Live while it tracks, without re-rendering:
swipe.offset;     // MotionValue<number>, px toward direction
swipe.velocity;   // MotionValue<number>, px/s
swipe.willCommit; // MotionValue<boolean>: would letting go commit?
swipe.state;      // 'idle' | 'possible' | 'tracking'`;

const ARROW: Record<Direction, typeof ArrowLeftIcon> = {
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  left: ArrowLeftIcon,
  right: ArrowRightIcon,
};

// How a Direction moves the card: the axis and its sign.
const AXIS: Record<Direction, readonly ['x' | 'y', 1 | -1]> = {
  up: ['y', -1],
  down: ['y', 1],
  left: ['x', -1],
  right: ['x', 1],
};

const SPRING = { type: 'spring', duration: 0.45, bounce: 0.15 } as const;

function Screen(props: {
  readonly options: SwipeOptions;
  readonly controls: ReactNode;
}) {
  const { direction, fingers, rule } = props.options;
  const [axis, sign] = AXIS[direction];
  // Px the card has travelled toward `direction`.
  const travel = useMotionValue(0);
  const opacity = useMotionValue(1);
  const tracking = useRef(false);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  const [armed, setArmed] = useState(false);
  const [last, setLast] = useState('none yet');

  const swipe = useSwipe({
    direction,
    fingers,
    commit: RULES[rule],
    onStart: () => {
      animation.current?.stop();
      opacity.jump(1);
      tracking.current = true;
    },
    onCommit: (release) => {
      tracking.current = false;
      setLast(
        `Commit · ${Math.round(release.offset)}px · ${Math.round(release.velocity)}px/s`,
      );
      // Off it goes with the fingers' speed, then a fresh card fades in.
      animation.current = animate(travel, 420, {
        type: 'spring',
        duration: 0.5,
        bounce: 0,
        velocity: release.velocity,
        onComplete: () => {
          travel.jump(0);
          animation.current = animate(opacity, [0, 1], { duration: 0.2 });
        },
      });
    },
    onCancel: (reason) => {
      tracking.current = false;
      setLast(`Cancel · ${reason}`);
      animation.current = animate(travel, 0, SPRING);
    },
  });

  useEffect(
    () =>
      swipe.offset.on('change', (offset) => {
        if (tracking.current) travel.set(offset);
      }),
    [swipe.offset, travel],
  );
  useMotionValueEvent(swipe.willCommit, 'change', setArmed);

  const x = useTransform(travel, (v) => (axis === 'x' ? sign * v : 0));
  const y = useTransform(travel, (v) => (axis === 'y' ? sign * v : 0));
  const rotate = useTransform(travel, (v) =>
    axis === 'x' ? sign * v * 0.04 : 0,
  );
  const offsetText = useTransform(swipe.offset, px);
  const velocityText = useTransform(
    swipe.velocity,
    (v) => `${Math.round(v)}px/s`,
  );
  const Arrow = ARROW[direction];

  return (
    <>
      <Stage className="h-[26rem] max-h-[64svh]">
        <motion.div
          style={{ x, y, rotate, opacity }}
          className={cn(
            'flex h-52 w-40 flex-col items-center justify-center gap-3 rounded-3xl bg-background shadow-lg ring-1 transition-[box-shadow,color] duration-150',
            armed ? 'text-positive ring-2 ring-positive' : 'ring-edge',
          )}
        >
          <Arrow aria-hidden="true" className="size-10" />
          <span className="text-sm text-muted-foreground">
            {armed
              ? 'Let go to commit'
              : fingers === 1
                ? `Swipe ${direction}`
                : `${fingers} fingers, ${direction}`}
          </span>
        </motion.div>
        <Fingers />
      </Stage>
      {props.controls}
      <Values>
        <Value label="state" testId="swipe-state">
          {swipe.state}
        </Value>
        <Value label="offset">
          <motion.span>{offsetText}</motion.span>
        </Value>
        <Value label="velocity">
          <motion.span>{velocityText}</motion.span>
        </Value>
        <Value label="willCommit">{String(armed)}</Value>
        <Value label="last" testId="swipe-last">
          {last}
        </Value>
      </Values>
    </>
  );
}

/** useSwipe on a card: it follows, flies off on Commit, springs back on Cancel. */
export function SwipeDemo(props: {
  readonly options: SwipeOptions;
  readonly onOptions: (options: SwipeOptions) => void;
}) {
  const { options } = props;
  const set = (patch: Partial<SwipeOptions>) =>
    props.onOptions({ ...options, ...patch });
  return (
    <Screen
      options={options}
      controls={
        <Controls>
          <Segmented
            label="Direction"
            value={options.direction}
            options={[
              { value: 'left', label: '← left' },
              { value: 'right', label: 'right →' },
              { value: 'up', label: '↑ up' },
              { value: 'down', label: '↓ down' },
            ]}
            onChange={(direction) => set({ direction })}
          />
          <Segmented
            label="Fingers"
            value={options.fingers}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
            onChange={(fingers) => set({ fingers })}
          />
          <Segmented
            label="Commits on"
            value={options.rule}
            options={[
              { value: 'either', label: 'Either' },
              { value: 'distance', label: '80px' },
              { value: 'flick', label: '500px/s' },
            ]}
            onChange={(rule) => set({ rule })}
          />
        </Controls>
      }
    />
  );
}
