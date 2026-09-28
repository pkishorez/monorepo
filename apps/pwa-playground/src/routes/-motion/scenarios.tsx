import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { useEffect, useRef, useState } from 'react';
import { Lesson, Live, Readouts, Trace, useWidth } from './kit.tsx';

const THUMB = 28;

function VolumeLesson() {
  const bar = useRef<HTMLDivElement>(null);
  const width = useWidth(bar);
  const x = useMotionValue(0);
  const max = Math.max(0, width - THUMB);
  useEffect(() => {
    if (max > 0 && x.get() === 0) x.jump(max / 2);
  }, [max, x]);
  const fill = useTransform(() => `${x.get() + THUMB / 2}px`);
  const percent = useTransform(
    () => `${max <= 0 ? 0 : Math.round((x.get() / max) * 100)}%`,
  );
  return (
    <Lesson
      id="volume"
      number="13"
      title="Volume slider: no momentum, hard walls"
      idea={
        <>
          <p>
            A control is not a toy. The volume must stay <b>exactly</b> where
            your finger lifts, so: no momentum (
            <code>dragMomentum={'{false}'}</code>, lesson 7), and a hard wall at
            0 and 100% instead of a rubber band (
            <code>dragElastic={'{0}'}</code>, lesson 9).
          </p>
          <p>
            Drag the thumb past 100% and keep going, then turn back. With{' '}
            <code>dragElastic={'{0}'}</code> the thumb waits until your pointer
            comes back to the wall before it moves again. The graph is flat at
            the ends: that is the wall.
          </p>
        </>
      }
      demo={
        <>
          <div
            ref={bar}
            className="relative h-14 w-full overflow-hidden rounded-2xl bg-muted"
          >
            <motion.div
              style={{ width: fill }}
              className="absolute inset-y-0 left-0 bg-foreground/85"
            />
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: max }}
              dragElastic={0}
              dragMomentum={false}
              style={{ x, width: THUMB }}
              className="absolute inset-y-0 left-0 cursor-ew-resize"
            />
          </div>
          <Readouts
            items={[{ label: 'volume', value: <Live value={percent} /> }]}
          />
          <Trace
            series={[
              { label: 'level', value: x, min: 0, max: Math.max(1, max) },
            ]}
            caption="flat at the ends: a hard wall"
          />
        </>
      }
      code={`
const x = useMotionValue(0);
const fill = useTransform(() => \`\${x.get()}px\`);

<div ref={bar}>
  <motion.div style={{ width: fill }} />   {/* the level */}
  <motion.div
    drag="x"
    dragConstraints={{ left: 0, right: barWidth }}
    dragElastic={0}        // hard wall at both ends
    dragMomentum={false}   // stays exactly where it is let go
    style={{ x }}
  />
</div>`}
      takeaways={[
        'Controls: no momentum, no rubber band. Content (maps, lists, photos): both.',
        'Drag an invisible thumb and derive the visible fill with useTransform.',
      ]}
    />
  );
}

const IMAGES = [
  'from-sky-500 to-indigo-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-fuchsia-600',
  'from-slate-400 to-slate-700',
];
const COMMIT = 0.4;
const FLICK = 300;

function GalleryLesson() {
  const frame = useRef<HTMLDivElement>(null);
  const width = useWidth(frame);
  const x = useMotionValue(0);
  const index = useRef(0);
  const [outcome, setOutcome] = useState('');
  const count = IMAGES.length;
  const page = useTransform(() => (width <= 0 ? 0 : -x.get() / width));
  const label = useTransform(
    () => `image ${Math.round(page.get()) + 1} / ${count}`,
  );
  useEffect(() => {
    x.jump(-index.current * width);
  }, [width, x]);
  return (
    <Lesson
      id="gallery"
      number="14"
      title="Image slider: a drag that decides like a swipe"
      idea={
        <>
          <p>
            A photo strip mixes everything so far. While dragging, it follows
            your finger. At the first and last image it gives way with{' '}
            <b>resistance</b> (<code>dragElastic</code>, lesson 9). On release
            it is a <b>decision</b> (lesson 11): next, previous or stay, by
            distance <i>or</i> flick. Then a <b>spring</b> carries your
            finger&apos;s speed onto the chosen image (lesson 6).
          </p>
          <p>
            Momentum is off: nobody wants to fly past three photos. The decision
            replaces it. And because pressing a moving strip catches it (lesson
            12), flick, flick, flick moves one image each time.
          </p>
        </>
      }
      demo={
        <>
          <div
            ref={frame}
            className="relative h-48 overflow-hidden rounded-lg bg-muted"
          >
            <motion.div
              drag="x"
              dragConstraints={{ left: -(count - 1) * width, right: 0 }}
              dragElastic={0.3}
              dragMomentum={false}
              style={{ x, width: count * width }}
              onDragEnd={(_, { offset, velocity }) => {
                const w = Math.max(1, width);
                const next =
                  velocity.x <= -FLICK ||
                  (velocity.x < FLICK && -offset.x / w >= COMMIT);
                const previous =
                  velocity.x >= FLICK ||
                  (velocity.x > -FLICK && offset.x / w >= COMMIT);
                const from = index.current;
                const to = Math.min(
                  count - 1,
                  Math.max(0, from + (next ? 1 : previous ? -1 : 0)),
                );
                index.current = to;
                setOutcome(
                  `${Math.round((Math.abs(offset.x) / w) * 100)}% at ${Math.round(Math.abs(velocity.x))} px/s → ${to > from ? 'next' : to < from ? 'previous' : 'stay'}`,
                );
                void animate(x, -to * w, {
                  type: 'spring',
                  stiffness: 500,
                  damping: 45,
                  velocity: velocity.x,
                });
              }}
              className="absolute inset-y-0 left-0 cursor-grab active:cursor-grabbing"
            >
              {IMAGES.map((gradient, i) => (
                <div
                  key={gradient}
                  style={{ left: i * width, width }}
                  className={`absolute inset-y-0 flex items-center justify-center bg-linear-to-br text-5xl font-semibold text-white/90 ${gradient}`}
                >
                  {i + 1}
                </div>
              ))}
            </motion.div>
          </div>
          <Readouts
            items={[
              { label: 'page', value: <Live value={label} /> },
              { label: 'last release', value: outcome === '' ? '—' : outcome },
            ]}
          />
          <Trace
            series={[{ label: 'page', value: page, min: 0, max: count - 1 }]}
            guides={IMAGES.map((_, i) => ({ at: i, label: `${i + 1}` }))}
            caption="dashed: each image"
          />
        </>
      }
      code={`
const x = useMotionValue(0);
let index = 0;

<motion.div
  drag="x"
  dragConstraints={{ left: -(count - 1) * width, right: 0 }}
  dragElastic={0.3}      // resistance at the first and last image
  dragMomentum={false}   // the decision replaces momentum
  style={{ x }}
  onDragEnd={(e, { offset, velocity }) => {
    // A flick decides by its direction; a slow release by distance.
    const next = velocity.x <= -${FLICK} || (velocity.x < ${FLICK} && -offset.x / width >= ${COMMIT});
    const prev = velocity.x >= ${FLICK} || (velocity.x > -${FLICK} && offset.x / width >= ${COMMIT});
    index = clamp(index + (next ? 1 : prev ? -1 : 0), 0, count - 1);

    animate(x, -index * width, {
      type: 'spring', stiffness: 500, damping: 45,
      velocity: velocity.x,  // carry the finger's speed onto the page
    });
  }}
/>`}
      takeaways={[
        'Paging = drag without momentum + a commit rule + a spring with velocity.',
        'Keep the index outside the animation, and animate x to -index × width.',
      ]}
    />
  );
}

const MAP = 1200;
const CELL = 100;
const CELLS = MAP / CELL;
const COLUMNS = 'ABCDEFGHIJKL';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const;
const GLIDES = [0, 0.3, 0.8, 1.5] as const;

function MapLesson() {
  const view = useRef<HTMLDivElement>(null);
  const viewWidth = useWidth(view);
  const [viewHeight, setViewHeight] = useState(288);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  // The constraints depend on the zoom, so the zoom lives in state too.
  const [zoom, setZoom] = useState(1);
  const [power, setPower] = useState<number>(0.8);

  useEffect(() => {
    const element = view.current;
    if (element === null) return;
    setViewHeight(element.clientHeight);
    x.jump((element.clientWidth - MAP) / 2);
    y.jump((element.clientHeight - MAP) / 2);
  }, [x, y]);

  const size = MAP * zoom;
  const constraints = {
    left: Math.min(0, viewWidth - size),
    right: Math.max(0, viewWidth - size),
    top: Math.min(0, viewHeight - size),
    bottom: Math.max(0, viewHeight - size),
  };

  /** Zooms to `next`, keeping the point (px, py) in the view where it is. */
  const zoomAt = (next: number, px: number, py: number, spring: boolean) => {
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const k = target / scale.get();
    const tx = px + (x.get() - px) * k;
    const ty = py + (y.get() - py) * k;
    setZoom(target);
    if (spring) {
      void animate(scale, target, ZOOM_SPRING);
      void animate(x, tx, ZOOM_SPRING);
      void animate(y, ty, ZOOM_SPRING);
      return;
    }
    scale.set(target);
    x.set(tx);
    y.set(ty);
  };
  const latestZoomAt = useRef(zoomAt);
  latestZoomAt.current = zoomAt;

  // A trackpad pinch arrives as a wheel event with ctrlKey.
  useEffect(() => {
    const element = view.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      latestZoomAt.current(
        scale.get() * Math.exp(-event.deltaY * 0.01),
        event.clientX - box.left,
        event.clientY - box.top,
        false,
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [scale]);

  const readout = useTransform(() => `×${scale.get().toFixed(2)}`);
  return (
    <Lesson
      id="map"
      number="15"
      title="Map: throw it, zoom it, keep it in bounds"
      idea={
        <>
          <p>
            A map uses everything at once: dragging with <b>momentum</b> and a
            long, lazy glide (lesson 8), <b>bounds</b> that keep the map
            covering the view with a <b>rubber band</b> at the edge (lesson 9),
            and bounds that <b>change with the zoom</b>. Zoomed in, there is
            more map to roam, so <code>dragConstraints</code> is worked out
            again from the current scale.
          </p>
          <p>
            Zooming must keep the spot you zoom on still. With the map at the
            top left and scaled from its own top left (
            <code>originX: 0, originY: 0</code>), that is one line per axis:{' '}
            <code>x = point + (x − point) × newScale / oldScale</code>. The
            buttons spring there around the centre; a trackpad pinch (or ctrl +
            scroll) zooms around the pointer.
          </p>
          <p>
            Framer Motion&apos;s <code>drag</code> covers one pointer. It has no
            pinch or rotate gesture: two-finger zoom and turn on a phone need
            your own pointer-event code (track both fingers, compare their
            distance and angle to where they started) and your own{' '}
            <code>animate(value, …, {"{ type: 'inertia' }"})</code> on release.
          </p>
        </>
      }
      demo={
        <>
          <div
            ref={view}
            className="relative h-72 overflow-hidden rounded-lg bg-muted/40"
          >
            <motion.div
              drag
              dragConstraints={constraints}
              dragElastic={0.2}
              dragTransition={{ power, timeConstant: 700 }}
              style={{
                x,
                y,
                scale,
                originX: 0,
                originY: 0,
                width: MAP,
                height: MAP,
                backgroundSize: `${CELL}px ${CELL}px`,
                backgroundImage:
                  'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
              }}
              className="absolute top-0 left-0 cursor-grab active:cursor-grabbing"
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${CELLS}, ${CELL}px)`,
                  gridTemplateRows: `repeat(${CELLS}, ${CELL}px)`,
                }}
              >
                {Array.from({ length: CELLS * CELLS }, (_, i) => (
                  <span
                    key={i}
                    className="p-1.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {COLUMNS[i % CELLS]}
                    {Math.floor(i / CELLS) + 1}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                zoomAt(scale.get() * 1.5, viewWidth / 2, viewHeight / 2, true)
              }
            >
              Zoom in
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                zoomAt(scale.get() / 1.5, viewWidth / 2, viewHeight / 2, true)
              }
            >
              Zoom out
            </Button>
            <span className="font-mono text-xs">
              <Live value={readout} />
            </span>
          </div>
          <Trace
            series={[
              { label: 'x', value: x, min: -MAP * 3, max: 400 },
              { label: 'scale', value: scale, min: 0, max: 4.5, tone: 'alt' },
            ]}
          />
        </>
      }
      controls={
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs">glide (power)</span>
          <div className="flex flex-wrap gap-1">
            {GLIDES.map((value) => (
              <Button
                key={value}
                size="xs"
                variant={power === value ? 'default' : 'outline'}
                onClick={() => setPower(value)}
              >
                {value === 0 ? 'Off' : value}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Maps usually want a long glide: throw it and compare.
          </p>
        </div>
      }
      code={`
const x = useMotionValue(0);
const y = useMotionValue(0);
const scale = useMotionValue(1);
const [zoom, setZoom] = useState(1); // the constraints need it on render

// Keep the map covering the view at the current zoom.
const size = MAP * zoom;
const constraints = {
  left: Math.min(0, viewWidth - size),  right: Math.max(0, viewWidth - size),
  top: Math.min(0, viewHeight - size),  bottom: Math.max(0, viewHeight - size),
};

// Zoom around a point (px, py) in the view: that point stays put.
function zoomAt(next, px, py) {
  const k = next / scale.get();
  const spring = { type: 'spring', stiffness: 400, damping: 40 };
  setZoom(next);
  animate(scale, next, spring);
  animate(x, px + (x.get() - px) * k, spring);
  animate(y, py + (y.get() - py) * k, spring);
}

<motion.div
  drag
  dragConstraints={constraints}
  dragElastic={0.2}
  dragTransition={{ power: ${power}, timeConstant: 700 }}
  style={{ x, y, scale, originX: 0, originY: 0 }}
/>`}
      takeaways={[
        'Bounds that depend on the zoom must be worked out again when the zoom changes.',
        'Scale from the top left and move x/y yourself: then "zoom around a point" is simple arithmetic.',
        'Two-finger pinch and rotate are not part of Framer Motion.',
      ]}
    />
  );
}

export function ScenarioLessons() {
  return (
    <>
      <VolumeLesson />
      <GalleryLesson />
      <MapLesson />
    </>
  );
}
