import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useRef, useState } from 'react';
import {
  Choice,
  Knob,
  Lesson,
  Live,
  PUCK,
  puckClass,
  Readouts,
  SpeedMeter,
  Stage,
  Trace,
  useSpeed,
  useWidth,
} from './kit.tsx';
import { BoundsLesson } from './bounds.tsx';

function Puck(props: { readonly momentum: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(24);
  const y = useMotionValue(60);
  const speed = useSpeed(x, y);
  return (
    <div className="flex flex-col gap-2">
      <Stage
        ref={stage}
        label={props.momentum ? 'dragMomentum: true' : 'dragMomentum: false'}
        className="h-48"
      >
        <motion.div
          drag
          dragConstraints={stage}
          dragMomentum={props.momentum}
          style={{ x, y }}
          className={puckClass}
        />
      </Stage>
      <SpeedMeter label="speed" speed={speed} />
      <Trace
        series={[
          {
            label: 'x',
            value: x,
            min: 0,
            max: Math.max(1, width - PUCK),
            tone: props.momentum ? 'alt' : 'main',
          },
        ]}
        caption=" "
      />
    </div>
  );
}

function AbruptLesson() {
  return (
    <Lesson
      id="abrupt"
      number="7"
      title="Letting go: the abrupt stop"
      idea={
        <>
          <p>
            Throw both pucks. On the left, the puck stops <b>the instant</b>{' '}
            your finger lifts, even if you were moving fast. The speed bar drops
            to zero in one frame and the graph has a sharp corner. In the real
            world nothing with speed stops instantly, so it feels like the puck
            hit invisible glue.
          </p>
          <p>
            On the right, the puck keeps the velocity it had and slows down by{' '}
            <b>friction</b>, like a hockey puck on ice. That glide is called{' '}
            <b>momentum</b> or <b>inertia</b>. The graph bends smoothly into
            flat instead of breaking.
          </p>
          <p>
            Stopping dead is still the right choice sometimes: a volume slider
            should stay exactly where you let go (lesson 13). The point is to
            choose it, not to get it by accident.
          </p>
        </>
      }
      demo={
        <div className="grid gap-4 sm:grid-cols-2">
          <Puck momentum={false} />
          <Puck momentum />
        </div>
      }
      code={`
<motion.div drag dragMomentum={false} />  // stops where the finger lifts
<motion.div drag />                       // glides on (dragMomentum defaults to true)`}
    />
  );
}

function MomentumLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(24);
  const y = useMotionValue(70);
  const speed = useSpeed(x, y);
  const ghostX = useMotionValue(-100);
  const ghostY = useMotionValue(-100);
  const [power, setPower] = useState(0.8);
  const [timeConstant, setTimeConstant] = useState(750);
  const [last, setLast] = useState<{ speed: number; travel: number } | null>(
    null,
  );
  const travel = useTransform(
    () => `${Math.round(x.get())}, ${Math.round(y.get())}`,
  );
  return (
    <Lesson
      id="momentum"
      number="8"
      title="Momentum: how far it glides, and for how long"
      idea={
        <>
          <p>
            Momentum in Framer (an <b>inertia</b> animation) needs only the
            release velocity and two knobs. No physics degree required:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <b>power</b> decides <b>how far</b>. Where it ends up is simply:
              <br />
              <code>where you let go + power × release speed</code>
              <br />
              Let go at 1000 px/s with power 0.8 and it travels 800 px. Power 0
              means no glide at all.
            </li>
            <li>
              <b>timeConstant</b> decides <b>how long</b> the glide takes, in
              milliseconds. Small = it brakes hard and stops quickly. Large = a
              long, lazy slide. It takes about 4× this number to come to rest.
            </li>
          </ul>
          <p>
            The dashed ring shows where the puck will end up the moment you let
            go: Framer works out the destination first, then animates there with
            a curve that starts at your finger&apos;s speed and fades out.
          </p>
        </>
      }
      demo={
        <>
          <Stage ref={stage} label="throw it">
            <motion.div
              style={{ x: ghostX, y: ghostY }}
              className="pointer-events-none absolute top-0 left-0 size-12 rounded-full border-2 border-dashed border-foreground/40"
            />
            <motion.div
              drag
              dragConstraints={stage}
              dragElastic={0.2}
              dragTransition={{ power, timeConstant }}
              style={{ x, y }}
              onDragEnd={(_, info) => {
                const box = stage.current;
                const maxX = (box?.clientWidth ?? 0) - PUCK;
                const maxY = (box?.clientHeight ?? 0) - PUCK;
                const clamp = (v: number, max: number) =>
                  Math.min(max, Math.max(0, v));
                ghostX.jump(clamp(x.get() + power * info.velocity.x, maxX));
                ghostY.jump(clamp(y.get() + power * info.velocity.y, maxY));
                const release = Math.hypot(info.velocity.x, info.velocity.y);
                setLast({
                  speed: Math.round(release),
                  travel: Math.round(power * release),
                });
              }}
              className={puckClass}
            />
          </Stage>
          <SpeedMeter label="speed" speed={speed} />
          <Trace
            series={[
              { label: 'x', value: x, min: 0, max: Math.max(1, width - PUCK) },
            ]}
          />
          <Readouts
            items={[
              {
                label: 'released at',
                value: last === null ? '—' : `${last.speed} px/s`,
              },
              {
                label: 'power × speed',
                value: last === null ? '—' : `${last.travel} px`,
              },
              {
                label: 'stops in about',
                value: `${((timeConstant * 4) / 1000).toFixed(1)} s`,
              },
              { label: 'position', value: <Live value={travel} /> },
            ]}
          />
        </>
      }
      controls={
        <>
          <Knob
            label="power"
            value={power}
            min={0}
            max={1.5}
            step={0.05}
            onChange={setPower}
            hint="How far: destination = release + power × speed. Framer's default 0.8."
          />
          <Knob
            label="timeConstant"
            value={timeConstant}
            min={50}
            max={1500}
            step={25}
            unit="ms"
            onChange={setTimeConstant}
            hint="How long: bigger is a lazier slide. Framer's drag default 750."
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPower(0.35);
              setTimeConstant(200);
            }}
          >
            Short and quick (0.35, 200ms)
          </Button>
        </>
      }
      code={`
<motion.div
  drag
  dragTransition={{
    power: ${power},         // how far: target = release + power × velocity
    timeConstant: ${timeConstant}, // how long, ms (it rests after ~4× this)
  }}
/>

// The same glide on any motion value, without drag:
animate(x, 0, { type: 'inertia', velocity: 1200, power: ${power}, timeConstant: ${timeConstant} });`}
      takeaways={[
        'Power = distance, timeConstant = duration. That is the whole model.',
        'Maps and long lists want long glides; small objects in a small box want short ones.',
        'Press "Short and quick" to feel a glide that says it had speed without sending it away.',
      ]}
    />
  );
}

type SnapMode = 'grid' | 'detents';

function SnapLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(0);
  const ideal = useMotionValue(-100);
  const [mode, setMode] = useState<SnapMode>('grid');
  const [step, setStep] = useState(80);
  const max = Math.max(0, width - PUCK);
  const detents = [0, Math.round(max * 0.3), max];
  const snapTo = (target: number) =>
    mode === 'grid'
      ? Math.round(target / step) * step
      : detents.reduce((best, d) =>
          Math.abs(d - target) < Math.abs(best - target) ? d : best,
        );
  const ticks =
    mode === 'grid'
      ? Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
      : detents;
  return (
    <Lesson
      id="snap"
      number="10"
      title="Snap points: choosing where it may rest"
      idea={
        <>
          <p>
            Remember that inertia works out the destination first (lesson 8)?
            That gives you a hook: <code>modifyTarget</code> lets you look at
            where it <i>would</i> land and pick somewhere else. Round it to the
            nearest grid step and you have a <b>snapping</b> ruler. Pick the
            nearest of a short list and you have <b>detents</b>, like a bottom
            sheet with closed, half and full.
          </p>
          <p>
            The glide still starts at your finger&apos;s speed, it just curves
            onto a tick. The faint ring shows where it would have landed without
            snapping.
          </p>
        </>
      }
      demo={
        <>
          <Stage ref={stage} className="h-32">
            {ticks.map((tick) => (
              <div
                key={tick}
                className="pointer-events-none absolute top-6 bottom-6 w-px bg-foreground/25"
                style={{ left: tick + PUCK / 2 }}
              />
            ))}
            <motion.div
              style={{ x: ideal }}
              className="pointer-events-none absolute top-10 left-0 size-12 rounded-full border-2 border-dashed border-foreground/30"
            />
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: max }}
              dragTransition={{
                power: 0.5,
                timeConstant: 300,
                modifyTarget: (target) => {
                  ideal.jump(target);
                  return Math.min(max, Math.max(0, snapTo(target)));
                },
              }}
              style={{ x }}
              className={cn(puckClass, 'top-10')}
            />
          </Stage>
          <Trace
            series={[{ label: 'x', value: x, min: 0, max: Math.max(1, max) }]}
            guides={ticks.map((tick) => ({ at: tick, label: `${tick}` }))}
            caption="dashed lines: the snap points"
          />
        </>
      }
      controls={
        <>
          <Choice
            label="rest on"
            value={mode}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'detents', label: 'Detents' },
            ]}
            onChange={setMode}
          />
          {mode === 'grid' ? (
            <Knob
              label="step"
              value={step}
              min={40}
              max={200}
              step={10}
              unit="px"
              onChange={setStep}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Closed, 30% and full: {detents.join(', ')} px.
            </p>
          )}
        </>
      }
      code={
        mode === 'grid'
          ? `
<motion.div
  drag="x"
  dragTransition={{
    power: 0.5,
    timeConstant: 300,
    // where it would land → where it may land
    modifyTarget: (target) => Math.round(target / ${step}) * ${step},
  }}
/>`
          : `
const detents = [${detents.join(', ')}]; // closed, half, full

<motion.div
  drag="x"
  dragTransition={{
    modifyTarget: (target) =>
      detents.reduce((best, d) =>
        Math.abs(d - target) < Math.abs(best - target) ? d : best),
  }}
/>`
      }
      takeaways={[
        'Snapping does not fight the throw: it only changes the destination.',
        'For "page by page" (carousels), a Swipe-style decision is often better: see lessons 11 and 14.',
      ]}
    />
  );
}

function SwipeLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(0);
  const vx = useVelocity(x);
  const [threshold, setThreshold] = useState(40);
  const [flick, setFlick] = useState(300);
  const [useSpeedRule, setUseSpeedRule] = useState(true);
  const [verdict, setVerdict] = useState('');
  const card = Math.max(1, width - 32);
  const decide = (distance: number, speed: number) => {
    // Measured toward commit: left is positive.
    if (useSpeedRule && speed >= flick) return 'flick';
    if (useSpeedRule && speed <= -flick) return 'flick back';
    return distance >= threshold / 100 ? 'far enough' : 'not far enough';
  };
  const commits = (reason: string) =>
    reason === 'flick' || reason === 'far enough';
  const armed = useTransform((): number =>
    commits(decide(-x.get() / card, -vx.get())) ? 1 : 0,
  );
  const background = useTransform(
    armed,
    [0, 1],
    ['oklch(0.6 0 0 / 0.15)', 'oklch(0.6 0.2 25 / 0.9)'],
  );
  const label = useTransform((): string =>
    armed.get() === 1 ? 'Release to delete' : 'Swipe left',
  );
  return (
    <Lesson
      id="swipe"
      number="11"
      title="A swipe is a decision, not a position"
      idea={
        <>
          <p>
            Some gestures do not just move a thing, they <b>decide</b>{' '}
            something: delete this row, open the drawer, go to the next photo.
            On release there are only two outcomes, <b>commit</b> or{' '}
            <b>cancel</b>, and the rule for choosing matters a lot.
          </p>
          <p>
            Rule 1, <b>distance</b>: commit if dragged past a share of the way
            (say 40%). Rule 2, <b>flick</b>: commit if moving fast enough toward
            commit, however short the drag. Real apps use both. Switch the speed
            rule off and try a short, fast flick: it will not delete, which
            feels broken. Switch it on: a flick deletes, and a flick <i>back</i>{' '}
            always cancels, even past 40%.
          </p>
          <p>
            Either way the card then springs to its outcome starting at your
            finger&apos;s speed (lesson 6). The background turns red while
            releasing now would commit: show the outcome before the finger
            lifts.
          </p>
        </>
      }
      demo={
        <>
          <Stage ref={stage} className="flex h-28 items-center px-4">
            <motion.div
              style={{ backgroundColor: background }}
              className="absolute inset-y-4 right-4 left-4 flex items-center justify-end rounded-lg px-4 font-mono text-xs text-white"
            >
              <Live value={label} />
            </motion.div>
            <motion.div
              drag="x"
              dragConstraints={{ left: -card, right: 0 }}
              dragElastic={0.1}
              dragMomentum={false}
              style={{ x }}
              onDragEnd={(_, info) => {
                const reason = decide(-info.offset.x / card, -info.velocity.x);
                const yes = commits(reason);
                setVerdict(
                  `${Math.round((-info.offset.x / card) * 100)}% at ${Math.round(-info.velocity.x)} px/s → ${reason} → ${yes ? 'deleted' : 'cancelled'}`,
                );
                void animate(x, yes ? -card - 40 : 0, {
                  type: 'spring',
                  stiffness: 500,
                  damping: 45,
                  velocity: info.velocity.x,
                }).then(() => {
                  if (yes)
                    setTimeout(
                      () => void animate(x, 0, { duration: 0.3 }),
                      400,
                    );
                });
              }}
              className="relative z-10 flex h-16 w-full cursor-grab items-center rounded-lg bg-background px-4 text-sm shadow ring-1 ring-foreground/10 active:cursor-grabbing"
            >
              A message you can swipe away
            </motion.div>
          </Stage>
          <p className="min-h-4 font-mono text-xs">{verdict}</p>
        </>
      }
      controls={
        <>
          <Knob
            label="commit distance"
            value={threshold}
            min={10}
            max={90}
            step={5}
            unit="%"
            onChange={setThreshold}
            hint="40% is a common choice."
          />
          <Choice
            label="flick rule"
            value={useSpeedRule ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(value) => setUseSpeedRule(value === 'on')}
          />
          {useSpeedRule ? (
            <Knob
              label="flick speed"
              value={flick}
              min={100}
              max={1500}
              step={50}
              unit=" px/s"
              onChange={setFlick}
              hint="About 300 px/s is a common choice."
            />
          ) : null}
        </>
      }
      code={`
// Framer has no "swipe": you build the decision in onDragEnd.
<motion.div
  drag="x"
  dragMomentum={false}
  style={{ x }}
  onDragEnd={(e, { offset, velocity }) => {
    const progress = -offset.x / width;  // toward commit
    const speed = -velocity.x;           // toward commit, px/s
    const commit =
      speed >= ${flick} ? true :           // flick forward
      speed <= -${flick} ? false :         // flick back
      progress >= ${threshold / 100};                // slow: far enough?
    animate(x, commit ? -width : 0, {
      type: 'spring', stiffness: 500, damping: 45, velocity: velocity.x,
    }).then(() => commit && onDelete());
  }}
/>`}
      takeaways={[
        'Distance alone ignores intent. Always combine distance with a flick speed.',
        'A flick back must cancel, even past the halfway point.',
        'Show the outcome before release, so nobody deletes by surprise.',
      ]}
    />
  );
}

function CatchLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(0);
  const max = Math.max(0, width - PUCK);
  const [caught, setCaught] = useState(0);
  const throwIt = () => {
    const to = x.get() < max / 2 ? max : 0;
    void animate(x, to, { type: 'spring', stiffness: 20, damping: 6 });
  };
  return (
    <Lesson
      id="catch"
      number="12"
      title="Catching it mid-air"
      idea={
        <>
          <p>
            Press <b>Throw</b>: the puck swings slowly on a loose spring. Now
            press on it while it moves. It stops right under your finger and you
            can drag it from there. That is <b>catching</b>, and it is why
            gestures use motion values: any animation on a value can be stopped
            with <code>value.stop()</code>, and the value simply stays where it
            was.
          </p>
          <p>
            Framer&apos;s <code>drag</code> does this for you on pointer down.
            Without it, animations feel like videos you cannot touch.
          </p>
        </>
      }
      demo={
        <>
          <Stage ref={stage} className="h-28">
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: max }}
              dragMomentum={false}
              onPointerDown={() => {
                if (x.isAnimating()) setCaught((n) => n + 1);
              }}
              style={{ x }}
              className={cn(puckClass, 'top-8')}
            />
          </Stage>
          <div className="flex items-center gap-3">
            <Button onClick={throwIt}>Throw</Button>
            <span className="font-mono text-xs">caught {caught}×</span>
          </div>
          <Trace
            series={[{ label: 'x', value: x, min: 0, max: Math.max(1, max) }]}
          />
        </>
      }
      code={`
// drag stops the value's animation on pointer down, for free.
<motion.div drag="x" style={{ x }} />

// Your own animations: stop them yourself.
const controls = animate(x, 300, { type: 'spring' });
x.stop();            // or controls.stop()
x.isAnimating();     // true while something animates it`}
    />
  );
}

export function DragLessons() {
  return (
    <>
      <AbruptLesson />
      <MomentumLesson />
      <BoundsLesson />
      <SnapLesson />
      <SwipeLesson />
      <CatchLesson />
    </>
  );
}
