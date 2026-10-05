import { cn } from '@kstackz/ui-toolkit/utils';
import {
  AnimatePresence,
  motion,
  type MotionValue,
  useTransform,
} from 'motion/react';
import type { ReactNode } from 'react';
import { COMMIT, type Reading, type Way, WAYS } from './recognize.ts';

// How far each arm's label sits from the centre, in px.
const REACH = 92;
// How far the puck follows the finger, in px.
const LEASH = 40;
// How far, in px, the centre keeps from each side of the screen, so every
// arm and the hint above stay on it.
const MARGIN = { x: 150, top: 200, bottom: 140 };

// Where the Compass stands: under the finger, unless that is too near an edge.
const placed = (at: { readonly x: number; readonly y: number }) => ({
  left: Math.min(Math.max(at.x, MARGIN.x), window.innerWidth - MARGIN.x),
  top: Math.min(Math.max(at.y, MARGIN.top), window.innerHeight - MARGIN.bottom),
});

const OFFSET: Readonly<
  Record<Way, { readonly x: number; readonly y: number }>
> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

type Arm = {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly works: boolean;
};

/**
 * The Thumb Lock as it is seen: a glow under the resting thumb, and under
 * the moving finger a puck on a leash with an arm for each way. The arm
 * the finger goes toward fills as it goes and lights when armed; an arm
 * that does nothing here is dimmed, and going toward it shakes everything.
 */
export function Compass(props: {
  readonly lock:
    | {
        readonly thumb: { readonly x: number; readonly y: number };
        readonly origin: { readonly x: number; readonly y: number };
        readonly reading: Reading;
        readonly ran?: boolean;
      }
    | undefined;
  readonly commands: Readonly<Record<Way, Arm>>;
  readonly dx: MotionValue<number>;
  readonly dy: MotionValue<number>;
}) {
  const { lock } = props;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100]"
      aria-hidden="true"
    >
      <AnimatePresence>
        {lock && (
          <motion.div
            key="thumb"
            className="absolute size-16 -translate-1/2 rounded-full bg-primary/10 ring-1 ring-primary/30"
            style={{ left: lock.thumb.x, top: lock.thumb.y }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="absolute inset-5 rounded-full bg-primary/40" />
            {/* One ripple as the Lock takes hold. */}
            <motion.span
              className="absolute inset-0 rounded-full ring-2 ring-primary/40"
              initial={{ opacity: 1, scale: 0.6 }}
              animate={{ opacity: 0, scale: 1.9 }}
              transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            />
          </motion.div>
        )}
        {lock && (
          <motion.div
            key="compass"
            className="absolute"
            style={placed(lock.origin)}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            <Rose {...props} reading={lock.reading} ran={lock.ran === true} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rose(props: {
  readonly reading: Reading;
  readonly ran: boolean;
  readonly commands: Readonly<Record<Way, Arm>>;
  readonly dx: MotionValue<number>;
  readonly dy: MotionValue<number>;
}) {
  const { reading } = props;
  const way = reading.kind === 'undecided' ? undefined : reading.way;
  const armed = reading.kind === 'going' && reading.armed;
  const puckX = useTransform(props.dx, (x) => clamp(x, LEASH));
  const puckY = useTransform(props.dy, (y) => clamp(y, LEASH));
  // Once the Command runs, the puck flies home to its arm.
  const flung = props.ran && way !== undefined ? OFFSET[way] : undefined;
  const hint =
    reading.kind === 'wrong'
      ? 'Nothing that way here'
      : props.ran && reading.kind === 'going'
        ? props.commands[reading.way].label
        : reading.kind === 'going'
          ? armed
            ? `Let go to ${props.commands[reading.way].label}`
            : props.commands[reading.way].label
          : 'Swipe a way';

  return (
    // A new Wrong Way shakes it once, keyed so each one starts afresh.
    <motion.div
      key={reading.kind === 'wrong' ? `wrong-${reading.way}` : 'calm'}
      animate={
        reading.kind === 'wrong' ? { x: [0, -7, 6, -4, 3, 0] } : { x: 0 }
      }
      transition={{ duration: 0.32, ease: 'easeOut' }}
    >
      <div className="absolute size-56 -translate-1/2 rounded-full bg-background/70 shadow-2xl ring-1 ring-foreground/10 backdrop-blur-md" />
      {WAYS.map((each) => (
        <Track
          key={each}
          way={each}
          shown={each === way && reading.kind === 'going'}
          {...props}
        />
      ))}
      {WAYS.map((each) => (
        <Label
          key={each}
          way={each}
          arm={props.commands[each]}
          state={
            each !== way
              ? 'idle'
              : reading.kind === 'wrong'
                ? 'wrong'
                : props.ran
                  ? 'ran'
                  : armed
                    ? 'armed'
                    : 'going'
          }
        />
      ))}
      <motion.div
        className={cn(
          'absolute size-11 -translate-1/2 rounded-full shadow-lg ring-2 transition-colors duration-150',
          armed
            ? 'bg-primary ring-primary'
            : reading.kind === 'wrong'
              ? 'bg-destructive/80 ring-destructive'
              : 'bg-foreground/80 ring-background',
        )}
        style={flung ? undefined : { x: puckX, y: puckY }}
        animate={
          flung ? { x: flung.x * REACH, y: flung.y * REACH, scale: 0.4 } : {}
        }
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      />
      <p
        className={cn(
          'absolute top-[-164px] -translate-x-1/2 rounded-full px-3.5 py-1.5 text-sm font-medium tracking-tight whitespace-nowrap shadow-lg ring-1 backdrop-blur-md',
          reading.kind === 'wrong'
            ? 'bg-destructive/15 text-destructive ring-destructive/30'
            : 'bg-background/85 text-foreground ring-foreground/10',
        )}
      >
        {hint}
      </p>
    </motion.div>
  );
}

const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

// The line from the centre to an arm, filling as the finger goes that way.
function Track(props: {
  readonly way: Way;
  readonly shown: boolean;
  readonly dx: MotionValue<number>;
  readonly dy: MotionValue<number>;
}) {
  const { x, y } = OFFSET[props.way];
  const fill = useTransform([props.dx, props.dy], ([dx, dy]) =>
    Math.max(
      0,
      Math.min(1, ((dx as number) * x + (dy as number) * y) / COMMIT),
    ),
  );
  const vertical = x === 0;
  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded-full bg-foreground/10 transition-opacity duration-150',
        props.shown ? 'opacity-100' : 'opacity-0',
        vertical
          ? 'h-[64px] w-1 -translate-x-1/2'
          : 'h-1 w-[64px] -translate-y-1/2',
      )}
      style={{
        left: vertical ? 0 : x > 0 ? 8 : -72,
        top: vertical ? (y > 0 ? 8 : -72) : 0,
      }}
    >
      <motion.div
        className="size-full bg-primary"
        style={{
          [vertical ? 'scaleY' : 'scaleX']: fill,
          transformOrigin: vertical
            ? y > 0
              ? 'top'
              : 'bottom'
            : x > 0
              ? 'left'
              : 'right',
        }}
      />
    </div>
  );
}

function Label(props: {
  readonly way: Way;
  readonly arm: Arm;
  readonly state: 'idle' | 'going' | 'armed' | 'wrong' | 'ran';
}) {
  const { x, y } = OFFSET[props.way];
  const { arm, state } = props;
  return (
    <motion.div
      className={cn(
        'absolute flex -translate-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ring-1 transition-colors duration-150',
        state === 'armed' || state === 'ran'
          ? 'bg-primary text-primary-foreground ring-primary'
          : state === 'wrong'
            ? 'bg-destructive/15 text-destructive ring-destructive/40'
            : state === 'going'
              ? 'bg-background text-foreground ring-primary/50'
              : 'bg-background/80 text-foreground ring-foreground/10',
        !arm.works && state !== 'wrong' && 'opacity-35',
      )}
      style={{ left: x * REACH, top: y * REACH }}
      animate={{
        scale:
          state === 'ran'
            ? 1.2
            : state === 'armed'
              ? 1.12
              : state === 'going'
                ? 1.04
                : 1,
      }}
      transition={{ type: 'spring', duration: 0.25, bounce: 0.3 }}
    >
      {arm.icon}
      {arm.label}
    </motion.div>
  );
}
