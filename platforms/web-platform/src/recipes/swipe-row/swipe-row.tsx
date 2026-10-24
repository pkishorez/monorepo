import { Trash2 } from '#lib/lucide';
import { cn } from '#lib/utils';
import { GestureZone, useSwipe } from '../../ui/input/index.ts';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { play } from '../../ui/input/sound/index.ts';

/** The share of the row's width past which letting go commits. */
const COMMIT_AT = 0.4;
/** A flick this fast, in px/s, commits however short. */
const FLICK = 650;

// Home: settles without a wobble. Out: carries the finger's speed away.
const HOME = { type: 'spring', visualDuration: 0.3, bounce: 0.15 } as const;
const OUT = {
  type: 'spring',
  visualDuration: 0.16,
  bounce: 0,
  // Done once out of sight, not when the spring's tail comes to rest.
  restDelta: 2,
  restSpeed: 200,
} as const;
// The gap it leaves closes as a drawer does: quick, then easing in.
const CLOSE = { duration: 0.18, ease: [0.32, 0.72, 0, 1] } as const;
const POP = { type: 'spring', duration: 0.3, bounce: 0.4 } as const;

/**
 * Under reduced motion it jumps where it would move: read as it moves, in
 * the browser only. A render reads it through `useReducedMotion`.
 */
const still = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export type SwipeRowProps = {
  /**
   * Runs once the row has slid out and its gap has closed. The row stays
   * gone: take it out of the list here.
   */
  readonly onSwipe: () => void;
  /** Which way the finger goes: left by default. */
  readonly direction?: 'left' | 'right';
  /** What shows behind the row as it goes: a trash can and "Delete" by default. */
  readonly label?: ReactNode;
  /** `destructive`, red, by default, or `quiet`, for what is easily undone. */
  readonly tone?: 'destructive' | 'quiet';
  /** Whether one finger swipes it: true by default. */
  readonly enabled?: boolean;
  /** Whether it clicks as it arms and goes: true by default. */
  readonly sounds?: boolean;
  /** For the row's shape, such as its corners. */
  readonly className?: string;
  readonly children: ReactNode;
};

/**
 * A row that one finger swipes aside. It follows the finger and, behind it,
 * shows what letting go does; past 40% of its width, or on a fast flick, it
 * arms, with a click and a buzz, and letting go slides it out, closes the
 * gap it leaves and then calls `onSwipe`. Coming back short springs it home.
 * Under reduced motion it jumps home, and goes at once.
 * Swipes the other way, and up and down, are left to whatever is around it,
 * such as a sidebar or the list's scroll. A mouse never swipes it.
 */
export function SwipeRow(props: SwipeRowProps) {
  // The row is a Gesture Zone of its own, so its Swipe hears only it.
  const zone = useRef<HTMLDivElement>(null);
  return (
    <GestureZone
      ref={zone}
      className={cn(
        'relative overflow-hidden rounded-lg bg-background',
        props.className,
      )}
    >
      <Swiped {...props} zone={zone} />
    </GestureZone>
  );
}

function Swiped(
  props: SwipeRowProps & {
    readonly zone: RefObject<HTMLDivElement | null>;
  },
) {
  const {
    direction = 'left',
    tone = 'destructive',
    enabled = true,
    sounds = true,
  } = props;
  const sign = direction === 'left' ? -1 : 1;
  const x = useMotionValue(0);
  const reduced = useReducedMotion() === true;
  const [armed, setArmed] = useState(false);
  const [width, setWidth] = useState(400);
  const shown = useTransform(x, [0, sign * 24], [0, 1]);
  const latest = useRef({ props, sounds, sign });
  latest.current = { props, sounds, sign };

  // The distance to commit follows the row's width as it changes.
  useLayoutEffect(() => {
    const element = props.zone.current;
    if (element === null) return;
    const measure = () => setWidth(element.offsetWidth || 400);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.zone]);

  const home = () => (still() ? x.jump(0) : void animate(x, 0, HOME));
  // Out the way it went, carrying the finger's speed, then the gap closes;
  // under reduced motion it is gone at once.
  const leave = async (velocity: number) => {
    const { props, sounds, sign } = latest.current;
    if (sounds) play('success');
    const element = props.zone.current;
    if (element !== null && !still()) {
      await animate(x, sign * element.offsetWidth, {
        ...OUT,
        velocity: sign * velocity,
      });
      await animate(
        element,
        { height: [element.offsetHeight, 0], opacity: [1, 0] },
        CLOSE,
      );
    }
    props.onSwipe();
  };
  const swipe = useSwipe({
    enabled,
    direction,
    commit: { distance: width * COMMIT_AT, velocity: FLICK },
    onCommit: ({ velocity }) => void leave(velocity),
    onCancel: home,
  });

  useMotionValueEvent(swipe.offset, 'change', (offset) =>
    x.set(latest.current.sign * offset),
  );
  useMotionValueEvent(swipe.willCommit, 'change', (will) => {
    setArmed(will);
    if (!will) return;
    if (latest.current.sounds) play('arm');
    navigator.vibrate?.(8);
  });

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ opacity: shown }}
        className={cn(
          'absolute inset-0 flex items-center gap-2 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
          direction === 'left' ? 'justify-end pr-5' : 'justify-start pl-5',
          tone === 'destructive'
            ? armed
              ? 'bg-destructive/20 text-destructive'
              : 'bg-destructive/10 text-destructive'
            : armed
              ? 'bg-muted text-foreground'
              : 'bg-muted/60 text-muted-foreground',
        )}
      >
        <motion.span
          animate={{ scale: armed ? 1.1 : 1 }}
          transition={reduced ? { duration: 0 } : POP}
          className="flex items-center gap-1.5 [&_svg]:size-4"
        >
          {props.label ?? (
            <>
              <Trash2 aria-hidden="true" /> Delete
            </>
          )}
        </motion.span>
      </motion.div>
      <motion.div style={{ x }} className="relative bg-inherit">
        {props.children}
      </motion.div>
    </>
  );
}
