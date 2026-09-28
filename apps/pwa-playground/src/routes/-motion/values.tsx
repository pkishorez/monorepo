import {
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type PointerEvent, useRef, useState } from 'react';
import {
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

const localX = (event: PointerEvent<HTMLElement>) =>
  event.clientX - event.currentTarget.getBoundingClientRect().left - PUCK / 2;

function StatePad() {
  const renders = useRef(0);
  renders.current += 1;
  const [x, setX] = useState(0);
  return (
    <Stage label="useState" className="h-40">
      <div
        className="absolute inset-0"
        onPointerMove={(event) => setX(localX(event))}
      >
        <div
          style={{ transform: `translateX(${x}px)` }}
          className={cn(puckClass, 'top-12 bg-foreground/70')}
        />
      </div>
      <span className="absolute right-3 bottom-2 font-mono text-xs">
        renders: {renders.current}
      </span>
    </Stage>
  );
}

function MotionValuePad() {
  const renders = useRef(0);
  renders.current += 1;
  const x = useMotionValue(0);
  return (
    <Stage label="useMotionValue" className="h-40">
      <div
        className="absolute inset-0"
        onPointerMove={(event) => x.set(localX(event))}
      >
        <motion.div style={{ x }} className={cn(puckClass, 'top-12')} />
      </div>
      <span className="absolute right-3 bottom-2 font-mono text-xs">
        renders: {renders.current}
      </span>
    </Stage>
  );
}

function MotionValueLesson() {
  return (
    <Lesson
      id="motion-value"
      number="1"
      title="A motion value is a box holding one number"
      idea={
        <>
          <p>
            Everything in Framer Motion starts here. A <b>motion value</b> is a
            tiny container for a number, like the ball&apos;s x position. You
            change it with <code>x.set(120)</code> and read it with{' '}
            <code>x.get()</code>. Hand it to{' '}
            <code>{'<motion.div style={{ x }}>'}</code> and the element moves.
          </p>
          <p>
            The trick: setting it does <b>not</b> re-render React. Motion writes
            the new transform straight to the element, once per frame. That is
            why animations stay smooth even in a big app. Move your pointer over
            both pads and watch the render counters.
          </p>
        </>
      }
      demo={
        <div className="grid gap-3 sm:grid-cols-2">
          <StatePad />
          <MotionValuePad />
        </div>
      }
      code={`
import { motion, useMotionValue } from 'motion/react';

function Ball() {
  const x = useMotionValue(0); // a box holding one number

  return (
    <div onPointerMove={(e) => x.set(e.nativeEvent.offsetX)}>
      {/* x.set() moves this element. React never re-renders. */}
      <motion.div style={{ x }} />
    </div>
  );
}`}
      takeaways={[
        'Motion values are for anything that changes every frame: positions, scale, progress.',
        'React state is for things that change rarely: which tab is open, what the list contains.',
      ]}
    />
  );
}

const TRACK = 240;
const HANDLE = 40;
const RANGE = TRACK - HANDLE;

function TransformLesson() {
  const x = useMotionValue(RANGE / 2);
  const progress = useTransform(x, [0, RANGE], [0, 1]);
  const rotate = useTransform(progress, [0, 1], [-90, 90]);
  const scale = useTransform(progress, [0, 0.5, 1], [0.6, 1, 1.4]);
  const background = useTransform(
    progress,
    [0, 1],
    ['oklch(0.7 0.15 240)', 'oklch(0.7 0.19 25)'],
  );
  const radius = useTransform(progress, [0, 1], ['50%', '8%']);
  const label = useTransform(() => `progress ${progress.get().toFixed(2)}`);
  const track = useRef<HTMLDivElement>(null);
  return (
    <Lesson
      id="transform"
      number="2"
      title="useTransform: one number drives everything else"
      idea={
        <>
          <p>
            Most animations are one number in disguise. A drawer&apos;s
            position, the dimmed background behind it, the arrow that turns: all
            of them follow <b>how far open</b> the drawer is.
          </p>
          <p>
            <code>useTransform(input, [from…], [to…])</code> maps one motion
            value onto another. Think of it as a ruler: when the input is at 0
            the output is at -90°, when the input is at 1 the output is at 90°,
            and everything in between is filled in for you. Drag the handle: one
            value, five effects.
          </p>
        </>
      }
      demo={
        <Stage className="flex h-64 flex-col items-center justify-center gap-6">
          <motion.div
            style={{ rotate, scale, background, borderRadius: radius }}
            className="flex size-20 items-center justify-center text-2xl text-white"
          >
            ↑
          </motion.div>
          <div
            ref={track}
            className="relative h-10 rounded-full bg-background ring-1 ring-foreground/10"
            style={{ width: TRACK }}
          >
            <motion.div
              drag="x"
              dragConstraints={track}
              dragElastic={0}
              dragMomentum={false}
              style={{ x, width: HANDLE, height: HANDLE }}
              className="absolute top-0 left-0 cursor-grab rounded-full bg-foreground shadow active:cursor-grabbing"
            />
          </div>
          <p className="font-mono text-xs">
            <Live value={label} />
          </p>
        </Stage>
      }
      code={`
const x = useMotionValue(0);

// The ruler: x from 0 to ${RANGE}px reads as progress 0 to 1.
const progress = useTransform(x, [0, ${RANGE}], [0, 1]);

// Everything else follows progress.
const rotate = useTransform(progress, [0, 1], [-90, 90]);
const scale  = useTransform(progress, [0, 0.5, 1], [0.6, 1, 1.4]); // 3 stops
const color  = useTransform(progress, [0, 1], ['#38bdf8', '#f43f5e']);

// Or compute anything with a function; it re-runs when x changes.
const label = useTransform(() => \`\${Math.round(progress.get() * 100)}%\`);

<motion.div drag="x" style={{ x }} />
<motion.div style={{ rotate, scale, backgroundColor: color }} />`}
      takeaways={[
        'Keep one source of truth (position, or progress 0 → 1) and derive the rest.',
        'Progress 0 → 1 is the most useful shape: it does not care how wide the screen is.',
      ]}
    />
  );
}

function VelocityLesson() {
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const x = useMotionValue(40);
  const y = useMotionValue(80);
  const vx = useVelocity(x);
  const speed = useSpeed(x, y);
  const [release, setRelease] = useState<number | null>(null);
  const position = useTransform(() => `${Math.round(x.get())} px`);
  return (
    <Lesson
      id="velocity"
      number="3"
      title="Velocity: how fast, right now"
      idea={
        <>
          <p>
            <b>Velocity</b> is speed with a direction: how many pixels something
            moves per second, and which way. 500 px/s to the right is +500, to
            the left is -500. Zero means it is not moving right now.
          </p>
          <p>
            Look at the graph while you drag. The black line is the puck&apos;s
            x position over time. Velocity is simply{' '}
            <b>how steep that line is</b>: a steep line is fast, a flat line is
            still. The orange line plots velocity itself.
          </p>
          <p>
            Velocity is the most important number in gesture animation.
            Everything after this page (momentum, springs that feel natural,
            flicks) is about <b>not throwing velocity away</b> when the finger
            lifts.
          </p>
        </>
      }
      demo={
        <>
          <Stage ref={stage} label="drag the puck, fast and slow">
            <motion.div
              drag
              dragConstraints={stage}
              dragMomentum={false}
              dragElastic={0}
              style={{ x, y }}
              onDragEnd={(_, info) =>
                setRelease(
                  Math.round(Math.hypot(info.velocity.x, info.velocity.y)),
                )
              }
              className={puckClass}
            />
          </Stage>
          <SpeedMeter label="speed now (useVelocity)" speed={speed} />
          <Trace
            series={[
              {
                label: 'x position',
                value: x,
                min: 0,
                max: Math.max(1, width - PUCK),
              },
              {
                label: 'x velocity',
                value: vx,
                min: -3000,
                max: 3000,
                tone: 'speed',
              },
            ]}
          />
          <Readouts
            items={[
              { label: 'x', value: <Live value={position} /> },
              {
                label: 'speed at release',
                value: release === null ? '—' : `${release} px/s`,
              },
            ]}
          />
        </>
      }
      code={`
const x = useMotionValue(0);
const xVelocity = useVelocity(x); // a motion value too: px per second

<motion.div
  drag
  style={{ x }}
  onDragEnd={(event, info) => {
    info.velocity.x; // the finger's speed as it let go, px/s
    info.offset.x;   // how far it was dragged
  }}
/>`}
      takeaways={[
        'Velocity = slope of the position line. Flat = 0.',
        'Velocity is reported in px per second: 500 means half a screen-width a second on a phone.',
        'Only the last moment matters: a drag that stops before lifting has 0 velocity.',
      ]}
    />
  );
}

export function ValueLessons() {
  return (
    <>
      <MotionValueLesson />
      <TransformLesson />
      <VelocityLesson />
    </>
  );
}
