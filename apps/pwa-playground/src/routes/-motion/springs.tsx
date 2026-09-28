import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useRef, useState } from 'react';
import {
  Choice,
  dampingRatio,
  describeRatio,
  Knob,
  Lesson,
  PUCK,
  puckClass,
  Stage,
  Trace,
  useWidth,
} from './kit.tsx';

const PAD = 12;

function Lane(props: {
  readonly label: string;
  readonly x: MotionValue<number>;
  readonly className?: string;
}) {
  return (
    <div className="relative h-16 overflow-hidden rounded-md bg-background/60">
      <span className="absolute top-1 right-2 font-mono text-[11px] text-muted-foreground">
        {props.label}
      </span>
      <motion.div
        style={{ x: props.x }}
        className={cn(
          puckClass,
          'top-2 left-3 cursor-default',
          props.className,
        )}
      />
    </div>
  );
}

function TweenSpringLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const end = Math.max(0, width - PUCK - PAD * 2 - 24);
  const tween = useMotionValue(0);
  const spring = useMotionValue(0);
  const [duration, setDuration] = useState(0.8);
  const [out, setOut] = useState(false);
  const toggle = () => {
    const to = out ? 0 : end;
    setOut(!out);
    void animate(tween, to, { duration, ease: 'easeInOut' });
    void animate(spring, to, { type: 'spring', stiffness: 170, damping: 20 });
  };
  return (
    <Lesson
      id="tween-spring"
      number="4"
      title="Tween or spring: two ways to get somewhere"
      idea={
        <>
          <p>
            A <b>tween</b> is a schedule: “go from A to B in 0.8 seconds,
            speeding up then slowing down”. It knows the duration in advance and
            ignores everything else.
          </p>
          <p>
            A <b>spring</b> is physics: an invisible rubber band pulls the ball
            toward B. It has no fixed duration; it arrives when the pulling and
            the braking balance out. Because it is physics, it keeps whatever
            speed the ball already has.
          </p>
          <p>
            Press <b>Toggle</b> once and they look similar. Now press it{' '}
            <b>twice quickly</b>. The tween stops dead and starts over from zero
            speed (a visible hitch). The spring turns around smoothly, because
            it starts from the speed the ball had. Gestures interrupt animations
            all the time, so gestures use springs.
          </p>
        </>
      }
      demo={
        <>
          <div
            ref={stage}
            className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3"
          >
            <Lane label="tween" x={tween} className="bg-foreground/70" />
            <Lane label="spring" x={spring} />
          </div>
          <div>
            <Button onClick={toggle}>Toggle</Button>
          </div>
          <Trace
            series={[
              { label: 'tween', value: tween, min: 0, max: Math.max(1, end) },
              {
                label: 'spring',
                value: spring,
                min: 0,
                max: Math.max(1, end),
                tone: 'alt',
              },
            ]}
            guides={[
              { at: 0, label: 'start' },
              { at: end, label: 'end' },
            ]}
          />
        </>
      }
      controls={
        <Knob
          label="tween duration"
          value={duration}
          min={0.2}
          max={2}
          step={0.1}
          unit="s"
          onChange={setDuration}
        />
      }
      code={`
const x = useMotionValue(0);

// Tween: a fixed schedule. Interrupted, it restarts from zero speed.
animate(x, 300, { duration: ${duration}, ease: 'easeInOut' });

// Spring: physics. Interrupted, it keeps the speed it has.
animate(x, 300, { type: 'spring', stiffness: 170, damping: 20 });`}
      takeaways={[
        'Tweens are fine for things nobody touches: a toast fading in, a skeleton pulsing.',
        'Anything a finger moves should finish with a spring or inertia.',
      ]}
    />
  );
}

type SpringMode = 'physics' | 'duration';

const PRESETS = [
  { label: 'Gentle', stiffness: 120, damping: 14, mass: 1 },
  { label: 'Wobbly', stiffness: 180, damping: 8, mass: 1 },
  { label: 'Snappy', stiffness: 500, damping: 30, mass: 1 },
  { label: 'No bounce', stiffness: 400, damping: 40, mass: 1 },
  { label: 'Heavy', stiffness: 200, damping: 20, mass: 4 },
  { label: 'Quick', stiffness: 800, damping: 50, mass: 1 },
] as const;

function SpringLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const end = Math.max(0, width - PUCK - PAD * 2 - 24);
  const x = useMotionValue(0);
  const [mode, setMode] = useState<SpringMode>('physics');
  const [stiffness, setStiffness] = useState(180);
  const [damping, setDamping] = useState(12);
  const [mass, setMass] = useState(1);
  const [bounce, setBounce] = useState(0.3);
  const [visualDuration, setVisualDuration] = useState(0.5);
  const [out, setOut] = useState(false);
  const ratio = dampingRatio({ stiffness, damping, mass });
  const transition =
    mode === 'physics'
      ? ({ type: 'spring', stiffness, damping, mass } as const)
      : ({ type: 'spring', bounce, visualDuration } as const);
  const play = () => {
    const to = out ? 0 : end;
    setOut(!out);
    void animate(x, to, transition);
  };
  return (
    <Lesson
      id="spring"
      number="5"
      title="Inside a spring: stiffness, damping, mass"
      idea={
        <>
          <p>
            Picture the ball tied to its target with a rubber band, sliding
            through honey. Three knobs describe it:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <b>Stiffness</b>: how hard the rubber band pulls. Higher = faster
              and snappier.
            </li>
            <li>
              <b>Damping</b>: how thick the honey is. It brakes the ball. Low =
              it overshoots and wobbles; high = it creeps in slowly.
            </li>
            <li>
              <b>Mass</b>: how heavy the ball is. Heavier = slower to start,
              slower to stop, bigger swings.
            </li>
          </ul>
          <p>
            You never need the physics formula. One number tells you the
            character: the <b>damping ratio</b>. Below 1 it bounces, exactly 1
            it lands without overshooting, above 1 it creeps. Watch the graph:
            the wave <i>is</i> the bounce.
          </p>
          <p>
            Framer also offers a friendlier form: <code>bounce</code> (0 = none,
            1 = a lot) and <code>visualDuration</code> (roughly when it looks
            arrived). Same spring, easier words.
          </p>
        </>
      }
      demo={
        <>
          <div ref={stage} className="rounded-lg bg-muted/50 p-3">
            <Lane label="" x={x} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={play}>Play</Button>
            {mode === 'physics'
              ? PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setStiffness(preset.stiffness);
                      setDamping(preset.damping);
                      setMass(preset.mass);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))
              : null}
          </div>
          <Trace
            series={[
              { label: 'x', value: x, min: -end * 0.4, max: end * 1.4 || 1 },
            ]}
            guides={[
              { at: 0, label: 'start' },
              { at: end, label: 'target' },
            ]}
          />
          {mode === 'physics' ? (
            <p className="font-mono text-xs">
              damping ratio {ratio.toFixed(2)}: {describeRatio(ratio)}
            </p>
          ) : null}
        </>
      }
      controls={
        <>
          <Choice
            label="describe it by"
            value={mode}
            options={[
              { value: 'physics', label: 'Physics' },
              { value: 'duration', label: 'Bounce + time' },
            ]}
            onChange={setMode}
          />
          {mode === 'physics' ? (
            <>
              <Knob
                label="stiffness"
                value={stiffness}
                min={10}
                max={1000}
                step={10}
                onChange={setStiffness}
                hint="How hard it pulls to the target."
              />
              <Knob
                label="damping"
                value={damping}
                min={1}
                max={100}
                step={1}
                onChange={setDamping}
                hint="How much it brakes."
              />
              <Knob
                label="mass"
                value={mass}
                min={0.1}
                max={5}
                step={0.1}
                onChange={setMass}
                hint="How heavy it is."
              />
            </>
          ) : (
            <>
              <Knob
                label="bounce"
                value={bounce}
                min={0}
                max={1}
                step={0.05}
                onChange={setBounce}
                hint="0 lands clean, 1 wobbles a lot."
              />
              <Knob
                label="visualDuration"
                value={visualDuration}
                min={0.1}
                max={1.5}
                step={0.05}
                unit="s"
                onChange={setVisualDuration}
                hint="When it looks arrived; the wobble can run past it."
              />
            </>
          )}
        </>
      }
      code={
        mode === 'physics'
          ? `
animate(x, target, {
  type: 'spring',
  stiffness: ${stiffness}, // pull
  damping: ${damping},     // brakes
  mass: ${mass},           // weight
});
// damping ratio = damping / (2 × √(stiffness × mass)) = ${ratio.toFixed(2)}

// Same thing as a transition prop:
<motion.div animate={{ x: target }}
  transition={{ type: 'spring', stiffness: ${stiffness}, damping: ${damping}, mass: ${mass} }} />

// Or let a value chase another one with a spring:
const smooth = useSpring(x, { stiffness: ${stiffness}, damping: ${damping} });`
          : `
animate(x, target, {
  type: 'spring',
  bounce: ${bounce},          // 0 = no overshoot
  visualDuration: ${visualDuration}, // seconds until it looks arrived
});`
      }
      takeaways={[
        'Pick bounciness with the damping ratio, then pick speed with stiffness.',
        'UI that you touch usually wants a ratio of 0.8 to 1: quick, with at most a tiny overshoot.',
        'Playful things (a like button, a pull-down toy) can go lower.',
      ]}
    />
  );
}

function ThrowLane(props: { readonly carry: boolean }) {
  const x = useMotionValue(0);
  return (
    <div className="flex flex-col gap-2">
      <Stage
        label={props.carry ? 'velocity: finger speed' : 'velocity: 0'}
        className="h-24"
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/20" />
        <motion.div
          drag="x"
          dragMomentum={false}
          style={{ x }}
          onDragEnd={(_, info) =>
            void animate(x, 0, {
              type: 'spring',
              stiffness: 200,
              damping: 18,
              velocity: props.carry ? info.velocity.x : 0,
            })
          }
          className={cn(puckClass, 'top-9 left-[calc(50%-24px)]')}
        />
      </Stage>
      <Trace
        series={[
          {
            label: 'x',
            value: x,
            min: -300,
            max: 300,
            tone: props.carry ? 'alt' : 'main',
          },
        ]}
        guides={[{ at: 0, label: 'home' }]}
        caption=" "
      />
    </div>
  );
}

function HandoffLesson() {
  return (
    <Lesson
      id="velocity-handoff"
      number="6"
      title="Hand the finger’s speed to the spring"
      idea={
        <>
          <p>
            Both balls spring back to the middle line when you let go. The only
            difference is one option: <code>velocity</code>.
          </p>
          <p>
            Grab each one and <b>throw it</b> sideways. The left one ignores how
            fast your finger was going: it freezes for an instant, then heads
            home. That freeze is what makes animations feel fake. The right one
            starts the spring <b>with your finger&apos;s speed</b>: it keeps
            flying a little, curves around, and comes home. No corner in the
            graph, no freeze.
          </p>
          <p>
            This is the single most important trick in gesture animation.
            Whatever happens after release (spring back, snap to a page, open a
            drawer), start it with the release velocity.
          </p>
        </>
      }
      demo={
        <div className="grid gap-4 sm:grid-cols-2">
          <ThrowLane carry={false} />
          <ThrowLane carry />
        </div>
      }
      code={`
<motion.div
  drag="x"
  dragMomentum={false}
  style={{ x }}
  onDragEnd={(event, info) => {
    animate(x, 0, {
      type: 'spring',
      stiffness: 200,
      damping: 18,
      velocity: info.velocity.x, // ← the whole trick (px/s)
    });
  }}
/>

// Framer's built-in version of "spring home, keeping speed":
<motion.div drag="x" dragSnapToOrigin />`}
      takeaways={[
        'A corner in the position graph is a jolt your eye notices.',
        'Carry the release velocity into every animation that follows a gesture.',
      ]}
    />
  );
}

export function SpringLessons() {
  return (
    <>
      <TweenSpringLesson />
      <SpringLesson />
      <HandoffLesson />
    </>
  );
}
