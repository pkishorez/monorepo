import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { useRef, useState } from 'react';
import {
  Choice,
  Knob,
  Lesson,
  Live,
  PUCK,
  puckClass,
  Readouts,
  Stage,
  Trace,
  useWidth,
} from './kit.tsx';

const INSET = 28;
const HEIGHT = 224;
const POWER = 0.8;
const TIME_CONSTANT = 700;

/** What a throw does when its glide reaches a bound. */
export type WallRule =
  | { readonly kind: 'stop' }
  | { readonly kind: 'park' }
  | {
      readonly kind: 'spring';
      readonly stiffness: number;
      readonly damping: number;
    }
  | { readonly kind: 'rebound'; readonly restitution: number }
  | { readonly kind: 'cap'; readonly limit: number };

type Stop = () => void;

/** The capped overshoot's spring: it peaks 1/25 s = 40ms after impact. */
const CAP_OMEGA = 25;

/**
 * The spring that runs from the moment the glide touches `wall` at `hit`
 * px/s (positive toward larger values).
 */
const atWall = (
  value: MotionValue<number>,
  wall: number,
  hit: number,
  rule: WallRule,
): Stop | undefined => {
  if (rule.kind === 'rebound') {
    // Critically damped: it leaves the wall at a share of the hit speed
    // and comes back to rest against it, never through it.
    const omega = Math.sqrt(300);
    return animate(value, wall, {
      type: 'spring',
      stiffness: omega * omega,
      damping: 2 * omega,
      velocity: -hit * rule.restitution,
    }).stop;
  }
  if (rule.kind === 'cap' && rule.limit > 0) {
    // A critically damped spring started at speed v peaks v / (ω·e) past
    // its target, 1/ω seconds in. Keep ω slow enough to see (40ms) and cap
    // the speed carried in, so the peak is exactly `limit` at most.
    const most = rule.limit * CAP_OMEGA * Math.E;
    return animate(value, wall, {
      type: 'spring',
      stiffness: CAP_OMEGA * CAP_OMEGA,
      damping: 2 * CAP_OMEGA,
      velocity: Math.sign(hit) * Math.min(Math.abs(hit), most),
    }).stop;
  }
  return undefined;
};

/**
 * Throws one axis of a value at `velocity` px/s with an inertia glide,
 * and decides itself what happens at `min`/`max`. The glide runs on a
 * plain number, so no frame past the wall is ever drawn.
 */
export const throwAxis = (
  value: MotionValue<number>,
  velocity: number,
  min: number,
  max: number,
  rule: Exclude<WallRule, { kind: 'spring' }>,
): Stop => {
  value.stop();
  const from = value.get();
  const inside = (at: number) => Math.min(max, Math.max(min, at));
  // Let go past the edge (dragElastic): spring back in.
  if (from !== inside(from)) {
    return animate(value, inside(from), {
      type: 'spring',
      stiffness: 400,
      damping: 40,
      velocity,
    }).stop;
  }
  const target = from + POWER * velocity;
  if (rule.kind === 'park') {
    return animate(value, inside(target), {
      type: 'inertia',
      velocity,
      power: POWER,
      timeConstant: TIME_CONSTANT,
      modifyTarget: inside,
    }).stop;
  }
  let after: Stop | undefined;
  let hitWall = false;
  const glide = animate(from, target, {
    type: 'inertia',
    velocity,
    power: POWER,
    timeConstant: TIME_CONSTANT,
    onUpdate: (at) => {
      if (hitWall) return;
      if (at >= min && at <= max) {
        value.set(at);
        return;
      }
      hitWall = true;
      glide.stop();
      const wall = at < min ? min : max;
      // Inertia's speed at any point is (target − position) / timeConstant.
      const hit = ((target - wall) / TIME_CONSTANT) * 1000;
      value.set(wall);
      after = atWall(value, wall, hit, rule);
    },
  });
  return () => {
    glide.stop();
    after?.();
  };
};

type Mode = WallRule['kind'];

const MODES: ReadonlyArray<{ readonly value: Mode; readonly label: string }> = [
  { value: 'stop', label: 'Stop dead' },
  { value: 'park', label: 'Park' },
  { value: 'spring', label: 'Spring past' },
  { value: 'rebound', label: 'Bounce back' },
  { value: 'cap', label: 'Capped overshoot' },
];

/** How far past the edge the box goes when the finger is `over` px past it. */
function ElasticChart(props: { readonly elastic: number }) {
  const max = 200;
  const points = (f: (over: number) => number) =>
    Array.from({ length: 41 }, (_, i) => {
      const over = (i / 40) * max;
      return `${i === 0 ? 'M' : 'L'}${(over / max) * 200} ${100 - (Math.min(f(over), max) / max) * 100}`;
    }).join('');
  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox="0 0 200 100"
        className="h-24 w-full rounded-md bg-muted/30"
        aria-hidden="true"
      >
        <path
          d={points((o) => o)}
          className="fill-none stroke-muted-foreground/40"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <path
          d={points((o) => o * props.elastic)}
          className="fill-none stroke-chart-8"
          strokeWidth={2}
        />
      </svg>
      <figcaption className="font-mono text-[11px] leading-snug text-muted-foreground">
        While dragging: finger past the edge (→, 0–200px) vs box past the edge
        (↑). <code>dragElastic {props.elastic}</code> is a straight line.
        Dashed: no resistance.
      </figcaption>
    </figure>
  );
}

const TERMS: ReadonlyArray<readonly [string, string, string]> = [
  [
    'dragElastic',
    'While the finger drags past the edge',
    'Share of the extra distance the box follows. 0 = wall, 0.35 = default, 1 = no resistance. Has no effect after release.',
  ],
  [
    'dragMomentum · power · timeConstant',
    'After release, before any wall',
    'Momentum (inertia): whether it glides, how far, how long.',
  ],
  [
    'Overshoot',
    'A glide reaching the edge',
    'How far past the bound the glide travels before coming back. Framer has no setting for a maximum.',
  ],
  [
    'bounceStiffness · bounceDamping',
    'A glide reaching the edge',
    'Framer’s boundary spring. It sets the overshoot only indirectly: stiffer = less, but faster throws always go further.',
  ],
  [
    'Restitution',
    'A glide reaching the edge',
    'The physics word for bounciness: the share of speed kept when bouncing off a surface. 0 = thud, 1 = perfect bounce.',
  ],
];

export function BoundsLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(INSET);
  const y = useMotionValue(80);
  const [mode, setMode] = useState<Mode>('stop');
  const [elastic, setElastic] = useState(0);
  const [stiffness, setStiffness] = useState(200);
  const [damping, setDamping] = useState(40);
  const [restitution, setRestitution] = useState(0.4);
  const [capPercent, setCapPercent] = useState(10);
  const stops = useRef<ReadonlyArray<Stop>>([]);

  const right = Math.max(INSET, width - PUCK - INSET);
  const bottom = HEIGHT - PUCK - INSET;
  const limit = (PUCK * capPercent) / 100;

  // The furthest past a bound since the last release, for the readout.
  const past = useMotionValue(0);
  const measure = (at: number, min: number, max: number) => {
    const over = Math.max(min - at, at - max, 0);
    if (over > past.get()) past.set(over);
  };
  useMotionValueEvent(x, 'change', (at) => measure(at, INSET, right));
  useMotionValueEvent(y, 'change', (at) => measure(at, INSET, bottom));
  const pastText = useTransform(
    () =>
      `${past.get().toFixed(1)} px (${((past.get() / PUCK) * 100).toFixed(1)}% of the puck)`,
  );

  const rule: WallRule =
    mode === 'spring'
      ? { kind: 'spring', stiffness, damping }
      : mode === 'rebound'
        ? { kind: 'rebound', restitution }
        : mode === 'cap'
          ? { kind: 'cap', limit }
          : { kind: mode };

  const native = rule.kind === 'spring';

  return (
    <Lesson
      id="bounds"
      number="9"
      title="Hitting the wall: bounds, rubber band and bounce"
      idea={
        <>
          <p>
            Most things live inside <b>bounds</b>: a map should not scroll into
            the void, a slider has an end. Framer calls them{' '}
            <code>dragConstraints</code>. What happens <b>at</b> a bound comes
            down to two separate moments, and each has its own setting:
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>
              <b>The finger drags past the edge.</b> That is{' '}
              <code>dragElastic</code>: 0 is a wall, anything above is a rubber
              band. It does nothing once the finger lifts.
            </li>
            <li>
              <b>A throw&apos;s glide reaches the edge.</b> That is the momentum
              meeting the wall. Framer&apos;s only answer is a spring that lets
              it go <b>past</b> the wall and pulls it back (
              <code>bounceStiffness</code>, <code>bounceDamping</code>).
            </li>
          </ol>
          <p>
            <b>Why the built-in hard wall flickers.</b> Setting{' '}
            <code>dragElastic={'{0}'}</code> makes Framer use a near-infinite
            wall spring after release. But Framer notices the wall one frame
            late: the glide is first drawn where it would be without the wall,
            then caught. At 3000 px/s one frame is 50px, so a hard throw flashes
            past the edge. No spring setting can fix a frame that is already
            drawn.
          </p>
          <p>
            The fix is to run the glide yourself on a plain number and check for
            the wall <b>before</b> writing to the element (
            <code>throwAxis</code> below, about 30 lines). Then you choose what
            the wall does:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <b>Stop dead</b>: stops on the wall at full speed. A thud, never a
              pixel past.
            </li>
            <li>
              <b>Park</b>: the glide is aimed at the wall and slows down to
              arrive exactly on it (built-in <code>modifyTarget</code>, no
              custom glide needed).
            </li>
            <li>
              <b>Spring past</b>: Framer&apos;s own boundary spring, for
              comparison. Overshoot grows with throw speed and nothing caps it.
            </li>
            <li>
              <b>Bounce back</b>: touches the wall, jumps back in a bit, and
              comes to rest against it. How much it keeps is the{' '}
              <b>restitution</b>.
            </li>
            <li>
              <b>Capped overshoot</b>: sinks into the wall by at most a set
              share of its own size, however hard you throw, then comes back. A
              wall firm enough to stop a fast throw within a few pixels does it
              in under one frame, so you would never see it. Instead the wall
              spring stays slow enough to watch (peaking 40ms after impact), and
              the speed carried into it is capped so the peak is exactly the
              limit.
            </li>
          </ul>
        </>
      }
      demo={
        <>
          <Stage ref={stage}>
            <div
              className="pointer-events-none absolute rounded-md border border-dashed border-foreground/30"
              style={{ inset: INSET }}
            />
            <motion.div
              key={native ? 'native' : 'custom'}
              drag
              dragConstraints={{ left: INSET, right, top: INSET, bottom }}
              dragElastic={elastic}
              dragMomentum={native}
              dragTransition={
                native
                  ? {
                      power: POWER,
                      timeConstant: TIME_CONSTANT,
                      bounceStiffness: stiffness,
                      bounceDamping: damping,
                    }
                  : undefined
              }
              style={{ x, y }}
              onPointerDown={() => {
                for (const stop of stops.current) stop();
                stops.current = [];
              }}
              onDragEnd={(_, info) => {
                past.set(0);
                if (rule.kind === 'spring') return;
                stops.current = [
                  throwAxis(x, info.velocity.x, INSET, right, rule),
                  throwAxis(y, info.velocity.y, INSET, bottom, rule),
                ];
              }}
              className={puckClass}
            />
          </Stage>
          <Trace
            series={[
              {
                label: 'x',
                value: x,
                min: 0,
                max: Math.max(1, width - PUCK),
              },
            ]}
            guides={[
              { at: INSET, label: 'left bound' },
              { at: right, label: 'right bound' },
            ]}
          />
          <Readouts
            items={[
              {
                label: 'overshoot (max)',
                value: <Live value={pastText} />,
              },
            ]}
          />
          <ElasticChart elastic={elastic} />
        </>
      }
      controls={
        <>
          <Knob
            label="dragElastic"
            value={elastic}
            min={0}
            max={1}
            step={0.05}
            onChange={setElastic}
            hint="While dragging past the edge. 0 = wall."
          />
          <Choice
            label="when a throw hits the wall"
            value={mode}
            options={MODES}
            onChange={setMode}
          />
          {mode === 'spring' ? (
            <>
              <Knob
                label="bounceStiffness"
                value={stiffness}
                min={20}
                max={2000}
                step={10}
                onChange={setStiffness}
                hint="How hard the wall pulls it back."
              />
              <Knob
                label="bounceDamping"
                value={damping}
                min={1}
                max={120}
                step={1}
                onChange={setDamping}
                hint="How fast the wobble dies."
              />
            </>
          ) : null}
          {mode === 'rebound' ? (
            <Knob
              label="restitution"
              value={restitution}
              min={0}
              max={1}
              step={0.05}
              onChange={setRestitution}
              hint="Share of the speed kept when it bounces off."
            />
          ) : null}
          {mode === 'cap' ? (
            <Knob
              label="max overshoot"
              value={capPercent}
              min={0.5}
              max={50}
              step={0.5}
              unit="% of size"
              onChange={setCapPercent}
              hint={`= ${limit.toFixed(2)} px for this ${PUCK}px puck. 0.5% is under a pixel: a wall with a hint of give.`}
            />
          ) : null}
        </>
      }
      code={codeFor(mode, {
        elastic,
        stiffness,
        damping,
        restitution,
        capPercent,
      })}
      takeaways={[
        'Two moments, two settings: dragElastic while dragging, the wall rule when a glide arrives.',
        'Framer’s built-in wall is a spring past the bound. For a true wall, run the glide yourself and check before you write.',
        '“Only 0.5% of the object may leave the bounds during momentum” is a capped overshoot. It is not dragElastic, and Framer has no prop for it.',
      ]}
    >
      <dl className="grid gap-px overflow-hidden rounded-lg bg-border ring-1 ring-edge">
        {TERMS.map(([term, when, meaning]) => (
          <div
            key={term}
            className="grid gap-1 bg-card px-3 py-2 sm:grid-cols-[14rem_11rem_1fr] sm:gap-3"
          >
            <dt className="font-mono text-xs">{term}</dt>
            <dd className="text-xs text-muted-foreground">{when}</dd>
            <dd className="text-sm text-pretty">{meaning}</dd>
          </div>
        ))}
      </dl>
    </Lesson>
  );
}

const HELPER = `
// A glide on a plain number: the element only ever gets positions
// inside the bounds, so no frame past the wall is drawn.
function throwAxis(value, velocity, min, max, atWall) {
  const target = value.get() + 0.8 * velocity; // power 0.8
  const glide = animate(value.get(), target, {
    type: 'inertia', velocity, power: 0.8, timeConstant: 700,
    onUpdate: (at) => {
      if (at >= min && at <= max) return value.set(at);
      glide.stop();
      const wall = at < min ? min : max;
      const hit = ((target - wall) / 700) * 1000; // speed at the wall, px/s
      value.set(wall);
      atWall(value, wall, hit);
    },
  });
  return glide;
}

<motion.div
  drag
  dragConstraints={{ left, right, top, bottom }}
  dragMomentum={false}       // we run the glide ourselves
  style={{ x, y }}
  onDragEnd={(e, { velocity }) => {
    throwAxis(x, velocity.x, left, right, atWall);
    throwAxis(y, velocity.y, top, bottom, atWall);
  }}
/>`;

function codeFor(
  mode: Mode,
  knobs: {
    readonly elastic: number;
    readonly stiffness: number;
    readonly damping: number;
    readonly restitution: number;
    readonly capPercent: number;
  },
): string {
  switch (mode) {
    case 'stop':
      return `
// Stop dead: at the wall, do nothing more.
const atWall = () => {};
${HELPER}`;
    case 'park':
      return `
// Park: aim the glide at the wall so it slows down to arrive on it.
// modifyTarget changes where inertia ends; it never crosses the bound.
<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 300 }}
  dragElastic={${knobs.elastic}}
  dragTransition={{
    power: 0.8,
    timeConstant: 700,
    modifyTarget: (target) => Math.min(300, Math.max(0, target)),
  }}
/>
// modifyTarget does not know the axis, so with drag (both axes) and
// different bounds per axis, call animate(x, …, { type: 'inertia',
// modifyTarget }) yourself per axis in onDragEnd.`;
    case 'spring':
      return `
// Framer's own boundary spring: the glide goes past the wall and is
// pulled back. It notices the wall one frame late.
<motion.div
  drag
  dragConstraints={{ left, right, top, bottom }}
  dragElastic={${knobs.elastic}}      // while dragging past the edge
  dragTransition={{
    power: 0.8,
    timeConstant: 700,
    bounceStiffness: ${knobs.stiffness}, // how hard the wall pulls back
    bounceDamping: ${knobs.damping},     // how fast the wobble dies
  }}
/>`;
    case 'rebound':
      return `
// Bounce back: leave the wall at a share of the impact speed,
// then come to rest against it. Critically damped, so it never
// goes through the wall on the way back.
const restitution = ${knobs.restitution};
const atWall = (value, wall, hit) =>
  animate(value, wall, {
    type: 'spring',
    stiffness: 300,
    damping: 2 * Math.sqrt(300),  // exactly critical
    velocity: -hit * restitution, // reversed: back into the box
  });
${HELPER}`;
    case 'cap':
      return `
// Capped overshoot: past the wall by at most ${knobs.capPercent}% of the object's size.
// A critically damped spring that starts at speed v peaks v / (ω·e) past
// its target, 1/ω seconds in (ω = √stiffness).
// Solving for ω alone gives a spring so stiff it peaks between frames,
// so fix ω for a visible 40ms and cap the speed instead.
const limit = size * ${knobs.capPercent / 100};
const omega = 25;                        // peak 1/25 s after impact
const most = limit * omega * Math.E;     // fastest speed that peaks at limit
const atWall = (value, wall, hit) =>
  animate(value, wall, {
    type: 'spring',
    stiffness: omega * omega,
    damping: 2 * omega,                  // exactly critical: no wobble
    velocity: Math.sign(hit) * Math.min(Math.abs(hit), most),
  });
${HELPER}`;
  }
}
