import { AnimatePresence, motion } from 'motion/react';
import { Cursor, ENTER, EXIT, SPRING, useSteps, useTargets } from './parts.tsx';

/*
 * Actors compose, drawn as a tree of dots that is busy all the time: each
 * parent keeps sending small pulses down to its Children, and each Child
 * rings as one arrives. Above the root sits its State, Home or Cart. A
 * pointer clicks the other one: the old State's branch pulls back into
 * the root, leaves first, and the new State's branch grows out of it,
 * root first, and starts pulsing too. The branches at the sides never
 * stop.
 */

type Point = { readonly x: number; readonly y: number };
type Node = Point & { readonly children?: ReadonlyArray<Point> };

const ROOT: Point = { x: 160, y: 20 };
const MID = 92;
const LEAF = 164;

/** Children in every State. */
const ALWAYS: ReadonlyArray<Node> = [
  {
    x: 52,
    y: MID,
    children: [
      { x: 28, y: LEAF },
      { x: 76, y: LEAF },
    ],
  },
  { x: 268, y: MID, children: [{ x: 268, y: LEAF }] },
];

/** Each State, and the branch only it has. */
const STATES = {
  Home: [
    {
      x: 160,
      y: MID,
      children: [
        { x: 128, y: LEAF },
        { x: 160, y: LEAF },
        { x: 192, y: LEAF },
      ],
    },
  ],
  Cart: [
    { x: 134, y: MID, children: [{ x: 134, y: LEAF }] },
    { x: 186, y: MID, children: [{ x: 186, y: LEAF }] },
  ],
} satisfies Record<string, ReadonlyArray<Node>>;
type State = keyof typeof STATES;

/**
 * Twice around: the pointer goes to the other State, clicks it, and the
 * tree changes and holds.
 */
const STEPS = [700, 300, 2600, 700, 300, 2600];

/** Grows root first; pulls back leaves first. `depth` is 1 or 2. */
const EDGE = {
  hidden: (depth: number) => ({
    pathLength: 0,
    transition: { ...EXIT, delay: (2 - depth) * 0.18 + 0.08 },
  }),
  shown: (depth: number) => ({
    pathLength: 1,
    transition: { ...ENTER, duration: 0.3, delay: 0.25 + (depth - 1) * 0.4 },
  }),
};
/** Pulses on a branch that is leaving go at once, not with their line. */
const PULSES = {
  hidden: { opacity: 0, transition: { duration: 0.1 } },
  shown: { opacity: 1, transition: { duration: 0 } },
};
const DOT = {
  hidden: (depth: number) => ({
    scale: 0,
    transition: { ...EXIT, delay: (2 - depth) * 0.18 },
  }),
  shown: (depth: number) => ({
    scale: 1,
    transition: {
      type: 'spring' as const,
      duration: 0.35,
      bounce: 0.25,
      delay: 0.5 + (depth - 1) * 0.4,
    },
  }),
};

export function Compose() {
  const [ref, step, round] = useSteps(STEPS, 2);
  const targets = useTargets(ref);
  const state: State = step >= 1 && step <= 3 ? 'Cart' : 'Home';
  const aim: State = step <= 2 ? 'Cart' : 'Home';
  const clicks = round * 2 + (step >= 1 ? 1 : 0) + (step >= 4 ? 1 : 0);
  const target = targets[aim];
  return (
    <div ref={ref} className="relative w-full max-w-80">
      <div className="mx-auto flex w-fit rounded-full border border-border p-0.5 font-mono text-[11px]">
        {(Object.keys(STATES) as ReadonlyArray<State>).map((name) => (
          <span
            key={name}
            data-target={name}
            className={`relative rounded-full px-3 py-1 transition-colors delay-100 duration-200 ${
              name === state ? 'text-background' : 'text-muted-foreground'
            }`}
          >
            {name === state && (
              <motion.span
                layoutId="compose-state"
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-foreground"
              />
            )}
            <span className="relative">{name}</span>
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 320 180"
        className="mt-1 w-full overflow-visible text-foreground"
      >
        {ALWAYS.map((node, index) => (
          <Branch key={index} node={node} seed={index * 2} />
        ))}
        <AnimatePresence initial={false}>
          <motion.g key={state} initial="hidden" animate="shown" exit="hidden">
            {STATES[state].map((node, index) => (
              <Branch key={index} node={node} seed={5 + index * 3} grows />
            ))}
          </motion.g>
        </AnimatePresence>
        {/* The root, ringing as its State changes. */}
        {clicks > 0 && (
          <motion.circle
            key={clicks}
            cx={ROOT.x}
            cy={ROOT.y}
            fill="none"
            stroke="currentColor"
            initial={{ r: 9, opacity: 0.6 }}
            animate={{ r: 24, opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
        <circle cx={ROOT.x} cy={ROOT.y} r={9} fill="currentColor" />
      </svg>
      <Cursor
        at={target && { x: target.x + 2, y: target.y + 4 }}
        pressed={step === 1 || step === 4}
        clicks={clicks}
      />
    </div>
  );
}

/**
 * A Child of the root and its own Children, each line carrying pulses
 * down. One that `grows` draws itself in and out with its State.
 */
function Branch({
  node,
  seed,
  grows = false,
}: {
  readonly node: Node;
  readonly seed: number;
  readonly grows?: boolean;
}) {
  return (
    <g>
      <Edge from={ROOT} to={node} depth={1} grows={grows} seed={seed} />
      {node.children?.map((child, index) => (
        <Edge
          key={index}
          from={node}
          to={child}
          depth={2}
          grows={grows}
          seed={seed + index + 1}
        />
      ))}
      <Dot at={node} depth={1} grows={grows} />
      {node.children?.map((child, index) => (
        <Dot key={index} at={child} depth={2} grows={grows} small />
      ))}
    </g>
  );
}

function Edge({
  from,
  to,
  depth,
  grows,
  seed,
}: {
  readonly from: Point;
  readonly to: Point;
  readonly depth: number;
  readonly grows: boolean;
  readonly seed: number;
}) {
  // Each line pulses on its own beat, so the tree never moves as one.
  const travel = 0.9;
  const pause = 1.1 + ((seed * 0.47) % 1.3);
  const start = (grows ? 1.3 : 0) + ((seed * 0.29) % 1.4);
  return (
    <>
      <motion.line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className="stroke-foreground/25"
        variants={grows ? EDGE : undefined}
        custom={depth}
      />
      <motion.g variants={grows ? PULSES : undefined}>
        <motion.circle
          r={2.25}
          fill="currentColor"
          className="motion-reduce:hidden"
          initial={{ cx: from.x, cy: from.y, opacity: 0 }}
          animate={{
            cx: [from.x, to.x],
            cy: [from.y, to.y],
            opacity: [0, 0.9, 0.9, 0],
          }}
          transition={{
            duration: travel,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: pause,
            delay: start,
            opacity: {
              duration: travel,
              times: [0, 0.15, 0.85, 1],
              repeat: Infinity,
              repeatDelay: pause,
              delay: start,
            },
          }}
        />
        {/* The Child rings as the pulse reaches it. */}
        <motion.circle
          cx={to.x}
          cy={to.y}
          fill="none"
          stroke="currentColor"
          className="motion-reduce:hidden"
          initial={{ r: 6, opacity: 0 }}
          animate={{ r: [6, 14], opacity: [0.45, 0] }}
          transition={{
            duration: 0.5,
            ease: 'easeOut',
            repeat: Infinity,
            repeatDelay: travel + pause - 0.5,
            delay: start + travel,
          }}
        />
      </motion.g>
    </>
  );
}

function Dot({
  at,
  depth,
  grows,
  small = false,
}: {
  readonly at: Point;
  readonly depth: number;
  readonly grows: boolean;
  readonly small?: boolean;
}) {
  return (
    <motion.circle
      cx={at.x}
      cy={at.y}
      r={small ? 5 : 7}
      fill="currentColor"
      variants={grows ? DOT : undefined}
      custom={depth}
    />
  );
}
