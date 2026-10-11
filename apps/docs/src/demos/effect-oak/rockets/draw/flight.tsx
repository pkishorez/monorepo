import { createContext, use, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, motionValue } from 'motion/react';
import type { MotionValue, TargetAndTransition } from 'motion/react';
import { Drawing, Wreck, type Boosters } from './ship.js';
import { Place, Site, useSlot, type Point, type Slot } from './site.js';

/*
 * A rocket in flight: where it is in each State, and how it gets there.
 * Each State's drawing mounts fresh, so where a rocket is lives here, in
 * motion values kept per Instance: every State animates on from wherever
 * the last one left it.
 */

export type Tag =
  | 'OnPad'
  | 'Ascending'
  | 'Separating'
  | 'Cruising'
  | 'Descending'
  | 'Landed'
  | 'Returning'
  | 'Crashed'
  | 'Lost';

type Values = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  opacity: MotionValue<number>;
};

const placed = new Map<string, Values>();

/** While true, each rocket outlines itself for a moment every time it draws. */
export const ShowRenders = createContext(false);

/** An outline that flashes each time its rocket draws. */
function RenderFlash() {
  const renders = useRef(0);
  renders.current++;
  return (
    <motion.span
      key={renders.current}
      aria-hidden
      className="pointer-events-none absolute -inset-3 rounded-lg border-2 border-foreground"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    />
  );
}

const valuesOf = (id: string, start: Point): Values => {
  let values = placed.get(id);
  if (!values) {
    values = {
      x: motionValue(start.x),
      y: motionValue(start.y),
      rotate: motionValue(0),
      opacity: motionValue(0),
    };
    placed.set(id, values);
  }
  return values;
};

const up = (p: Point, by: number, x = 0) => ({ x: p.x + x, y: p.y - by });

/** Where a rocket goes in each State, from its pads. */
export function flight(
  tag: Tag,
  { launch, landing = launch }: Slot,
  safe: boolean,
  gone: boolean,
): TargetAndTransition {
  switch (tag) {
    case 'OnPad':
      return gone
        ? {
            x: [launch.x, launch.x],
            y: [launch.y, launch.y],
            rotate: 0,
            opacity: [0, 1],
          }
        : {
            ...launch,
            rotate: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 80, damping: 18 },
          };
    case 'Ascending':
      return {
        ...up(launch, 170),
        rotate: 0,
        opacity: 1,
        transition: { duration: 1.9, ease: [0.55, 0, 0.6, 1] },
      };
    case 'Separating':
      return {
        ...up(launch, 240),
        rotate: 0,
        opacity: 1,
        transition: { duration: 1.4, ease: 'easeOut' },
      };
    case 'Cruising':
      return {
        x: [null, launch.x - 34, launch.x - 34, launch.x + 30, launch.x],
        y: [
          null,
          launch.y - 275,
          launch.y - 315,
          launch.y - 300,
          launch.y - 240,
        ],
        rotate: [null, -14, 0, 14, 0],
        opacity: 1,
        transition: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
      };
    case 'Descending':
      return {
        x: [null, landing.x, landing.x + (safe ? 0 : 8)],
        y: [null, landing.y - 290, landing.y],
        rotate: [null, 0, safe ? 0 : 16],
        opacity: 1,
        transition: {
          duration: 3.4,
          times: [0, 0.4, 1],
          ease: safe ? 'easeInOut' : 'easeIn',
        },
      };
    case 'Landed':
    case 'Crashed':
      return { ...landing, rotate: 0, opacity: 1 };
    case 'Returning':
      return {
        x: [landing.x, landing.x, launch.x, launch.x],
        y: [landing.y, landing.y + 70, launch.y + 70, launch.y],
        rotate: 0,
        opacity: 1,
        transition: {
          duration: 2.4,
          times: [0, 0.2, 0.8, 1],
          ease: 'easeInOut',
        },
      };
    case 'Lost':
      return {
        ...up(launch, 760, 170),
        rotate: 38,
        opacity: 0,
        transition: { duration: 3, ease: 'easeIn' },
      };
  }
}

const boostersIn = (tag: Tag): Boosters =>
  tag === 'OnPad'
    ? 'strapped'
    : tag === 'Ascending'
      ? 'firing'
      : tag === 'Separating'
        ? 'falling'
        : 'none';

const firingIn = (tag: Tag) =>
  tag === 'Ascending' ||
  tag === 'Separating' ||
  tag === 'Cruising' ||
  tag === 'Descending';

const onLanding = (tag: Tag) =>
  tag === 'Descending' || tag === 'Landed' || tag === 'Crashed';

/** The life of a rocket, in the order it lives it, then the two ways it can end badly. */
const LIFE: ReadonlyArray<Tag> = [
  'OnPad',
  'Ascending',
  'Separating',
  'Cruising',
  'Descending',
  'Landed',
  'Returning',
];
const ENDS: ReadonlyArray<Tag> = ['Crashed', 'Lost'];

/**
 * One rocket on its pads. `actions` sit under the launch pad, `landed` under
 * the landing pad. `shake` replays a shake when it changes. Drawn on its own,
 * a rocket brings its own site, and with `life` the strip of its States.
 */
export function Flight(props: {
  id: string;
  tag: Tag;
  fuel: number;
  safe?: boolean;
  onFuel?: () => void;
  actions?: ReactNode;
  landed?: ReactNode;
  /** Drawn over the rocket for a moment as it mounts, like a scrubbed launch. */
  note?: ReactNode;
  /** Shakes the rocket once each time it changes. */
  shake?: number | null;
  /** Whether the rocket can fly, and so has a landing pad. */
  flies?: boolean;
}) {
  const slot = useSlot();
  if (slot) return <Placed {...props} slot={slot} />;
  return (
    <div className="relative size-full">
      <Site count={1} landing={!!props.flies} bottom={props.flies ? 72 : 24}>
        <Place index={0} name="R-1">
          <Flight {...props} />
        </Place>
      </Site>
      {props.flies && <Life tag={props.tag} />}
    </div>
  );
}

function Placed({
  id,
  tag,
  fuel,
  safe = true,
  onFuel,
  actions,
  landed,
  note,
  shake = null,
  flies,
  slot,
}: Parameters<typeof Flight>[0] & { slot: Slot }) {
  const values = valuesOf(id, slot.launch);
  const fuelling = tag === 'OnPad' && !!onFuel && fuel < 100;
  return (
    <>
      <Pad
        at={slot.launch}
        name={slot.name}
        label={slot.name}
        tag={flies ? tag : undefined}
        lit
      >
        {actions}
      </Pad>
      {flies && slot.landing && (
        <Pad
          at={slot.landing}
          name={`${slot.name} landing`}
          lit={onLanding(tag)}
        >
          {landed}
        </Pad>
      )}
      <motion.div
        className="pointer-events-none absolute top-0 left-0"
        style={{ ...values, originY: 1 }}
        animate={flight(tag, slot, safe, values.opacity.get() < 0.05)}
      >
        <div className="relative -translate-x-1/2 -translate-y-full">
          {use(ShowRenders) && <RenderFlash />}
          {note}
          <motion.div
            key={shake ?? 'still'}
            animate={shake === null ? {} : { x: [0, -8, 8, -6, 6, -3, 0] }}
            transition={{ duration: 0.5 }}
          >
            <button
              type="button"
              aria-label={`${slot.name}: ${tag}, fuel ${fuel}`}
              disabled={!fuelling}
              onClick={onFuel}
              className="pointer-events-auto block cursor-pointer disabled:cursor-default"
            >
              {tag === 'Crashed' ? (
                <Wreck />
              ) : (
                <Drawing
                  fuel={fuel}
                  firing={firingIn(tag)}
                  boosters={boostersIn(tag)}
                />
              )}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}

function Pad({
  at,
  name,
  label,
  tag,
  lit,
  children,
}: {
  at: Point;
  /** What the recorder and screen readers call this pad. */
  name: string;
  label?: string;
  tag?: Tag;
  lit: boolean;
  children?: ReactNode;
}) {
  return (
    <motion.div
      role="group"
      aria-label={name}
      className="absolute top-0 left-0 flex w-40 flex-col items-center"
      initial={{ x: at.x - 80, y: at.y, opacity: 0 }}
      animate={{ x: at.x - 80, y: at.y, opacity: lit ? 1 : 0.35 }}
      transition={{ type: 'spring', stiffness: 80, damping: 18 }}
    >
      <div
        className={`h-3 w-20 border-x border-b border-foreground ${lit ? '' : 'border-dashed'}`}
      />
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {label ?? 'landing'}
        {tag && <span className="text-foreground"> · {tag}</span>}
      </p>
      <div className="mt-1.5 flex h-7 gap-1.5">{children}</div>
    </motion.div>
  );
}

/** The strip of a lone rocket's States, with the one it is in lit. */
function Life({ tag }: { tag: Tag }) {
  const item = (each: Tag) => (
    <li key={each} className="relative px-1.5 py-1">
      {each === tag && (
        <motion.span
          layoutId="life"
          className="absolute inset-0 rounded-full bg-foreground"
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        />
      )}
      <span
        className={`relative transition-colors duration-300 ${each === tag ? 'text-background' : 'text-muted-foreground'}`}
      >
        {each}
      </span>
    </li>
  );
  return (
    <ol className="absolute inset-x-0 bottom-5 flex items-center justify-center font-mono text-[10px]">
      {LIFE.map(item)}
      <li aria-hidden className="mx-1.5 h-4 w-px bg-border" />
      {ENDS.map(item)}
    </ol>
  );
}

/** A quiet button under a pad. */
export const Action = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    className="rounded-full border border-foreground/30 px-3 py-0.5 text-xs transition-colors hover:border-foreground"
  >
    {children}
  </motion.button>
);
