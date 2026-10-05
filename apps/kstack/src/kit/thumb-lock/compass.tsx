import { cn } from '@kstackz/ui-toolkit/utils';
import {
  AnimatePresence,
  motion,
  type MotionValue,
  useTransform,
} from 'motion/react';
import { COMMIT, type Reading, type Way, WAYS } from './recognize.ts';

// How far each arm's label sits from the centre, in px.
const REACH = 64;
// How far the dot follows the finger, in px.
const LEASH = 28;
// How far, in px, the centre keeps from each side of the screen, so every
// arm stays on it.
const MARGIN = { x: 110, top: 90, bottom: 90 };

const EASE = [0.23, 1, 0.32, 1] as const;

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

type Arm = { readonly label: string; readonly works: boolean };

type ArmState = 'waiting' | 'aside' | 'going' | 'armed' | 'ran';

/**
 * The Thumb Lock as it is seen, quietly: a faint ring under the resting
 * thumb, and under the moving finger a dot on a short leash with a small
 * label for each way that does something here; other ways have none. The
 * way the finger goes draws a thin line that fills as it goes, and its
 * label zooms in once armed. Nothing has a backdrop: the page stays in view.
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
            className="absolute size-10 -translate-1/2 rounded-full ring-1 ring-foreground/25"
            style={{ left: lock.thumb.x, top: lock.thumb.y }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: EASE }}
          >
            {/* One ripple as the Lock takes hold. */}
            <motion.span
              className="absolute inset-0 rounded-full ring-1 ring-foreground/30"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 1.8 }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </motion.div>
        )}
        {lock && (
          <motion.div
            key="compass"
            className="absolute"
            style={placed(lock.origin)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.12, ease: EASE }}
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
  const dotX = useTransform(props.dx, (x) => clamp(x, LEASH));
  const dotY = useTransform(props.dy, (y) => clamp(y, LEASH));
  // Once the Command runs, the dot goes home to its arm.
  const flung = props.ran && way !== undefined ? OFFSET[way] : undefined;
  const stateOf = (each: Way): ArmState =>
    way === undefined || reading.kind === 'wrong'
      ? 'waiting'
      : each !== way
        ? 'aside'
        : props.ran
          ? 'ran'
          : armed
            ? 'armed'
            : 'going';

  return (
    <>
      {way !== undefined && reading.kind === 'going' && (
        <Track way={way} dx={props.dx} dy={props.dy} />
      )}
      {/* Only the ways that do something here have a label. */}
      {WAYS.filter((each) => props.commands[each].works).map((each, i) => (
        <Label
          key={each}
          way={each}
          order={i}
          label={props.commands[each].label}
          state={stateOf(each)}
        />
      ))}
      <motion.div
        className={cn(
          'absolute size-3 -translate-1/2 rounded-full transition-colors duration-150',
          reading.kind === 'wrong' ? 'bg-destructive' : 'bg-foreground',
        )}
        style={flung ? undefined : { x: dotX, y: dotY }}
        animate={
          flung ? { x: flung.x * REACH, y: flung.y * REACH, scale: 0.3 } : {}
        }
        transition={{ duration: 0.16, ease: EASE }}
      />
    </>
  );
}

const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

// The thin line from the centre toward an arm, filling as the finger goes.
function Track(props: {
  readonly way: Way;
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
  const length = REACH - 14;
  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded-full bg-foreground/10',
        vertical ? 'w-0.5 -translate-x-1/2' : 'h-0.5 -translate-y-1/2',
      )}
      style={{
        width: vertical ? undefined : length,
        height: vertical ? length : undefined,
        left: vertical ? 0 : x > 0 ? 6 : -6 - length,
        top: vertical ? (y > 0 ? 6 : -6 - length) : 0,
      }}
    >
      <motion.div
        className="size-full bg-foreground/60"
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

// How each label looks: waiting for a way, set aside for another, the way
// being swiped, armed to run on release, or run.
const LOOK: Readonly<
  Record<ArmState, { readonly opacity: number; readonly scale: number }>
> = {
  waiting: { opacity: 0.85, scale: 1 },
  aside: { opacity: 0.3, scale: 0.92 },
  going: { opacity: 1, scale: 1 },
  armed: { opacity: 1, scale: 1.18 },
  ran: { opacity: 1, scale: 1.26 },
};

/**
 * One way's label. It grows out of the finger as the Lock takes hold,
 * zooms in with a small spring once armed, and settles back if the finger
 * comes back short of arming.
 */
function Label(props: {
  readonly way: Way;
  readonly order: number;
  readonly label: string;
  readonly state: ArmState;
}) {
  const { x, y } = OFFSET[props.way];
  const { state } = props;
  const lit = state === 'armed' || state === 'ran';
  return (
    <motion.div
      className={cn(
        'absolute top-0 left-0 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm transition-colors duration-150',
        lit
          ? 'border-primary bg-primary text-primary-foreground'
          : state === 'going'
            ? 'bg-popover text-foreground'
            : 'bg-popover text-muted-foreground',
      )}
      // Centred on its point by Motion, which owns the transform.
      style={{ translateX: '-50%', translateY: '-50%' }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
      animate={{ x: x * REACH, y: y * REACH, ...LOOK[state] }}
      transition={
        lit
          ? { type: 'spring', duration: 0.3, bounce: 0.45 }
          : {
              type: 'spring',
              duration: 0.32,
              bounce: 0.2,
              delay: state === 'waiting' ? props.order * 0.03 : 0,
            }
      }
    >
      {props.label}
    </motion.div>
  );
}
