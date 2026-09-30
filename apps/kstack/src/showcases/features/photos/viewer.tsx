import { XIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { GestureZone } from '@kstackz/use-gesture';
import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import {
  animate,
  type MotionValue,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Photo } from './data.ts';
import { between, down, track } from './fingers.ts';
import { PhotoArt } from './photo.tsx';

const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;
const GLIDE = { type: 'spring', visualDuration: 0.45, bounce: 0 } as const;
/** Between photos as they slide past each other. */
const GAP = 16;
const MAX_ZOOM = 4;
/** How far a finger moves before it means something. */
const SLOP = 8;

type Point = { readonly x: number; readonly y: number };
type Size = { readonly w: number; readonly h: number };
type Zoom = {
  readonly z: MotionValue<number>;
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
};
/** Where the open photo starts: its grid tile, as a transform of its full size. */
type Lift = { x: number; y: number; k: number; ix: number; iy: number };

type ViewerProps = {
  readonly photos: ReadonlyArray<Photo>;
  readonly start: number;
  /** Where a photo's tile is on screen now, to grow from and shrink back to. */
  readonly rectOf: (id: string) => DOMRect | undefined;
  readonly onIndexChange: (index: number) => void;
  readonly onClosed: () => void;
};

type PhotosProps = ViewerProps & {
  /** It started going back to its tile. */
  readonly onClosing: () => void;
};

/**
 * One photo over the whole screen, grown from its tile. Swipe between
 * photos, pinch or double-tap to zoom, pan when zoomed, swipe down to put it
 * back. Its zone takes every touch; the albums are off while it is open.
 * Once it starts going back it is inert, so touches reach the grid under it
 * at once, and the grid scrolls while it settles.
 */
export function Viewer(props: ViewerProps) {
  const [closing, setClosing] = useState(false);
  return (
    <GestureZone className="absolute inset-0 z-20" inert={closing}>
      <Photos {...props} onClosing={() => setClosing(true)} />
    </GestureZone>
  );
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// Past a bound it follows at a third: it can be pulled, but it resists.
const resist = (v: number, min: number, max: number) =>
  v < min ? min + (v - min) / 3 : v > max ? max + (v - max) / 3 : v;

// The photo's size fitted inside the screen.
const fit = (photo: Photo, screen: Size): Size =>
  photo.aspect > screen.w / screen.h
    ? { w: screen.w, h: screen.w / photo.aspect }
    : { w: screen.h * photo.aspect, h: screen.h };

const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
const TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

type Segment = { readonly stop: (interrupted: boolean) => void };

function Photos(props: PhotosProps) {
  const { photos } = props;
  const [screen, setScreen] = useState<Size>(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const pitch = screen.w + GAP;
  const center = { x: screen.w / 2, y: screen.h / 2 };
  const last = photos.length - 1;

  const [index, setIndexState] = useState(props.start);
  const here = useRef(props.start);
  const [chrome, setChrome] = useState(true);
  const closing = useRef(false);

  // 0 at its tile, 1 open; the backdrop and chrome follow it and `dim`.
  const open = useMotionValue(0);
  const dim = useMotionValue(1);
  const shade = useTransform(() => open.get() * dim.get());
  const strip = useMotionValue(-props.start * pitch);
  // Swipe down: the photo follows the finger and shrinks.
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const shrink = useTransform(dy, [0, screen.h], [1, 0.5]);

  const liftOf = (i: number): Lift => {
    const photo = photos[i];
    const rect = photo === undefined ? undefined : props.rectOf(photo.id);
    if (photo === undefined || rect === undefined) {
      return { x: 0, y: 0, k: 0.9, ix: 0, iy: 0 };
    }
    const size = fit(photo, screen);
    const side = Math.min(size.w, size.h);
    return {
      x: rect.left + rect.width / 2 - center.x,
      y: rect.top + rect.height / 2 - center.y,
      k: rect.width / side,
      ix: (size.w - side) / 2,
      iy: (size.h - side) / 2,
    };
  };
  const [opened] = useState(() => liftOf(props.start));
  // Where its tile is: fixed as it opens, and measured every frame as it
  // goes back, so it lands on its tile even while the grid scrolls, or
  // follows it off the screen.
  const tile = useTransform(open, () =>
    closing.current ? liftOf(here.current) : opened,
  );
  const liftX = useTransform(() => (tile.get()?.x ?? 0) * (1 - open.get()));
  const liftY = useTransform(() => (tile.get()?.y ?? 0) * (1 - open.get()));
  const liftScale = useTransform(() => {
    const k = tile.get()?.k ?? 1;
    return k + (1 - k) * open.get();
  });
  const liftClip = useTransform(() => {
    const { ix = 0, iy = 0 } = tile.get() ?? {};
    const v = open.get();
    return `inset(${iy * (1 - v)}px ${ix * (1 - v)}px)`;
  });

  // Each photo keeps its own zoom while it slides away.
  const zooms = useRef(new Map<string, Zoom>());
  const zoomOf = (id: string): Zoom => {
    let zoom = zooms.current.get(id);
    if (zoom === undefined) {
      zoom = { z: motionValue(1), x: motionValue(0), y: motionValue(0) };
      zooms.current.set(id, zoom);
    }
    return zoom;
  };

  const bounds = (photo: Photo, z: number) => {
    const size = fit(photo, screen);
    return {
      x: Math.max(0, (z * size.w - screen.w) / 2),
      y: Math.max(0, (z * size.h - screen.h) / 2),
    };
  };

  // Zooms to `z`, keeping the photo's point under `around` where it is.
  const zoomTo = (photo: Photo, z: number, around: Point) => {
    const zoom = zoomOf(photo.id);
    const z0 = zoom.z.get();
    const next = clamp(z, 1, MAX_ZOOM);
    const b = bounds(photo, next);
    const to = (axis: 'x' | 'y') =>
      clamp(
        around[axis] -
          center[axis] -
          (next * (around[axis] - center[axis] - zoom[axis].get())) / z0,
        -b[axis],
        b[axis],
      );
    animate(zoom.x, to('x'), SPRING);
    animate(zoom.y, to('y'), SPRING);
    animate(zoom.z, next, SPRING);
  };

  const go = (next: number, velocity = 0) => {
    const from = here.current;
    const to = clamp(next, 0, last);
    here.current = to;
    if (to !== from) {
      setIndexState(to);
      props.onIndexChange(to);
    }
    const left = photos[from];
    void animate(strip, -to * pitch, { ...SPRING, velocity }).then(() => {
      if (to === from || left === undefined) return;
      const zoom = zoomOf(left.id);
      zoom.z.jump(1);
      zoom.x.jump(0);
      zoom.y.jump(0);
    });
  };

  const close = () => {
    const photo = photos[here.current];
    if (closing.current || photo === undefined) return;
    closing.current = true;
    props.onClosing();
    const zoom = zoomOf(photo.id);
    animate(zoom.z, 1, SPRING);
    animate(zoom.x, 0, SPRING);
    animate(zoom.y, 0, SPRING);
    animate(dx, 0, SPRING);
    animate(dy, 0, SPRING);
    void animate(open, 0, SPRING).then(props.onClosed);
  };

  useEffect(() => {
    void animate(open, 1, SPRING);
  }, [open]);

  // One finger: page when at 1x, pan when zoomed (paging only past the
  // photo's edge), or pull down to close. Decided once, past SLOP.
  const oneFinger = (finger: Pointer): Segment => {
    const i = here.current;
    const photo = photos[i];
    if (photo === undefined) return { stop: () => {} };
    const zoom = zoomOf(photo.id);
    for (const v of [strip, zoom.x, zoom.y, zoom.z, dx, dy, dim]) v.stop();
    const base = {
      x: zoom.x.get(),
      y: zoom.y.get(),
      z: zoom.z.get(),
      offset: strip.get() + i * pitch,
    };
    let mode: 'idle' | 'pan' | 'page' | 'dismiss' | 'none' = 'idle';
    // Past the first or last photo the strip resists.
    const page = (offset: number) =>
      strip.set(
        -i * pitch +
          ((i === 0 && offset > 0) || (i === last && offset < 0)
            ? offset / 3
            : offset),
      );

    const follow = () => {
      const mx = finger.dx.get();
      const my = finger.dy.get();
      if (mode === 'idle') {
        if (Math.hypot(mx, my) < SLOP) return;
        mode =
          base.z > 1.01
            ? 'pan'
            : base.offset !== 0 || Math.abs(mx) > Math.abs(my)
              ? 'page'
              : my > 0
                ? 'dismiss'
                : 'none';
      }
      if (mode === 'pan') {
        const b = bounds(photo, base.z);
        const total = base.x + base.offset + mx;
        const x = clamp(total, -b.x, b.x);
        zoom.x.set(x);
        page(total - x);
        zoom.y.set(resist(base.y + my, -b.y, b.y));
      } else if (mode === 'page') {
        page(base.offset + mx);
      } else if (mode === 'dismiss') {
        dx.set(mx);
        dy.set(my > 0 ? my : my / 4);
        dim.set(1 - clamp(my / (screen.h * 0.35), 0, 1));
      }
    };
    const stopTracking = track([finger], follow);

    return {
      stop: (interrupted) => {
        stopTracking();
        const vx = interrupted ? 0 : finger.x.getVelocity();
        const vy = interrupted ? 0 : finger.y.getVelocity();
        if (mode === 'dismiss') {
          if (!interrupted && (finger.dy.get() > 80 || vy > 500)) close();
          else {
            animate(dx, 0, SPRING);
            animate(dy, 0, SPRING);
            animate(dim, 1, SPRING);
          }
          return;
        }
        const offset = strip.get() + i * pitch;
        if (mode === 'pan') {
          const b = bounds(photo, zoom.z.get());
          animate(zoom.y, clamp(zoom.y.get() + vy * 0.2, -b.y, b.y), {
            ...GLIDE,
            velocity: vy,
          });
          if (offset === 0) {
            animate(zoom.x, clamp(zoom.x.get() + vx * 0.2, -b.x, b.x), {
              ...GLIDE,
              velocity: vx,
            });
            return;
          }
        }
        if (mode === 'pan' || mode === 'page') {
          const far = screen.w / 4;
          go(
            offset < 0 && (offset < -far || vx < -400)
              ? i + 1
              : offset > 0 && (offset > far || vx > 400)
                ? i - 1
                : i,
            vx,
          );
        }
      },
    };
  };

  // Two fingers: zoom around the point between them, which follows them.
  const twoFingers = (a: Pointer, b: Pointer): Segment => {
    const i = here.current;
    const photo = photos[i];
    if (photo === undefined) return { stop: () => {} };
    const zoom = zoomOf(photo.id);
    for (const v of [zoom.x, zoom.y, zoom.z]) v.stop();
    // Whatever one finger had started springs back.
    if (strip.get() !== -i * pitch) go(i);
    animate(dx, 0, SPRING);
    animate(dy, 0, SPRING);
    animate(dim, 1, SPRING);
    const start = between(a, b);
    const z0 = zoom.z.get();
    const q = {
      x: (start.x - center.x - zoom.x.get()) / z0,
      y: (start.y - center.y - zoom.y.get()) / z0,
    };
    let at: Point = start;
    const stopTracking = track([a, b], () => {
      const now = between(a, b);
      at = now;
      const raw = (z0 * now.d) / Math.max(start.d, 1);
      const z =
        raw < 1
          ? 1 - (1 - raw) / 2
          : raw > MAX_ZOOM
            ? MAX_ZOOM + (raw - MAX_ZOOM) / 5
            : raw;
      zoom.z.set(z);
      zoom.x.set(now.x - center.x - z * q.x);
      zoom.y.set(now.y - center.y - z * q.y);
    });
    return {
      stop: () => {
        stopTracking();
        zoomTo(photo, zoom.z.get(), at);
      },
    };
  };

  const segment = useRef<(Segment & { fingers: Array<number> }) | undefined>(
    undefined,
  );
  const lastTap = useRef<(Point & { t: number }) | undefined>(undefined);
  const chromeTimer = useRef<number | undefined>(undefined);

  useGesture({
    directions: 'all',
    onPointer: (_pointer, pointers) => {
      if (closing.current) return;
      const fingers = down(pointers);
      const current = segment.current;
      const [a, b] = fingers;
      const held = (id: number) => fingers.some((f) => f.id === id);
      if (current !== undefined && current.fingers.every(held)) {
        // A third finger changes nothing; a second one turns a one-finger
        // drag into a pinch.
        if (current.fingers.length === 2 || b === undefined) return;
      }
      current?.stop(false);
      segment.current = undefined;
      if (a !== undefined && b !== undefined) {
        segment.current = { ...twoFingers(a, b), fingers: [a.id, b.id] };
      } else if (a !== undefined && current === undefined) {
        segment.current = { ...oneFinger(a), fingers: [a.id] };
      } else {
        // A pinch lost a finger: it settles, and the rest of the touch is spent.
        segment.current = { stop: () => {}, fingers: [] };
      }
    },
    onEnd: (pointers, { interrupted, preventClick }) => {
      segment.current?.stop(interrupted);
      segment.current = undefined;
      const [only] = pointers.values();
      const tapped =
        !interrupted &&
        pointers.size === 1 &&
        only !== undefined &&
        Math.hypot(only.dx.get(), only.dy.get()) < SLOP &&
        (only.end?.t ?? 0) - only.start.t < 300;
      if (!tapped) {
        preventClick();
        return;
      }
      const tap = { x: only.x.get(), y: only.y.get(), t: performance.now() };
      const before = lastTap.current;
      window.clearTimeout(chromeTimer.current);
      if (
        before !== undefined &&
        tap.t - before.t < 300 &&
        Math.hypot(tap.x - before.x, tap.y - before.y) < 40
      ) {
        lastTap.current = undefined;
        const photo = photos[here.current];
        if (photo === undefined) return;
        zoomTo(photo, zoomOf(photo.id).z.get() > 1.01 ? 1 : 2.5, tap);
        return;
      }
      lastTap.current = tap;
      chromeTimer.current = window.setTimeout(() => setChrome((c) => !c), 260);
    },
  });

  // Keys and a trackpad on a desktop: arrows page, Escape closes, a pinch
  // (a wheel with ctrl held) zooms, and a zoomed photo scrolls.
  const latest = useRef({ go, close, zoomOf, bounds });
  useEffect(() => {
    latest.current = { go, close, zoomOf, bounds };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (closing.current) return;
      if (event.key === 'Escape') latest.current.close();
      if (event.key === 'ArrowLeft') latest.current.go(here.current - 1);
      if (event.key === 'ArrowRight') latest.current.go(here.current + 1);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const photo = photos[here.current];
      if (photo === undefined || closing.current) return;
      const { zoomOf, bounds } = latest.current;
      const zoom = zoomOf(photo.id);
      const z0 = zoom.z.get();
      if (event.ctrlKey) {
        const z = clamp(z0 * Math.exp(-event.deltaY / 100), 1, MAX_ZOOM);
        const b = bounds(photo, z);
        for (const axis of ['x', 'y'] as const) {
          const p = axis === 'x' ? event.clientX : event.clientY;
          const c =
            axis === 'x' ? window.innerWidth / 2 : window.innerHeight / 2;
          zoom[axis].set(
            clamp(
              p - c - (z * (p - c - zoom[axis].get())) / z0,
              -b[axis],
              b[axis],
            ),
          );
        }
        zoom.z.set(z);
      } else if (z0 > 1.01) {
        const b = bounds(photo, z0);
        zoom.x.set(clamp(zoom.x.get() - event.deltaX, -b.x, b.x));
        zoom.y.set(clamp(zoom.y.get() - event.deltaY, -b.y, b.y));
      }
    };
    const onResize = () =>
      setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      window.clearTimeout(chromeTimer.current);
    };
  }, [photos]);

  // A new screen size moves the strip to the photo at once.
  useEffect(() => {
    strip.jump(-here.current * pitch);
  }, [strip, pitch]);

  const photo = photos[index];
  return (
    <>
      <motion.div
        className="absolute inset-0 bg-black"
        style={{ opacity: shade }}
      />
      <motion.div className="absolute inset-0" style={{ x: strip }}>
        {[index - 1, index, index + 1].map((i) => {
          const neighbour = photos[i];
          if (neighbour === undefined) return null;
          const current = i === index;
          const size = fit(neighbour, screen);
          const zoom = zoomOf(neighbour.id);
          return (
            <div
              key={neighbour.id}
              className="absolute top-0 grid place-items-center"
              style={{ left: i * pitch, width: screen.w, height: screen.h }}
            >
              <motion.div
                className="grid size-full place-items-center"
                style={
                  current
                    ? { x: dx, y: dy, scale: shrink }
                    : { x: 0, y: 0, scale: 1 }
                }
              >
                <motion.div style={{ x: zoom.x, y: zoom.y, scale: zoom.z }}>
                  <motion.div
                    style={{
                      width: size.w,
                      height: size.h,
                      ...(current
                        ? {
                            x: liftX,
                            y: liftY,
                            scale: liftScale,
                            clipPath: liftClip,
                          }
                        : { x: 0, y: 0, scale: 1, clipPath: 'none' }),
                    }}
                  >
                    <PhotoArt photo={neighbour} />
                  </motion.div>
                </motion.div>
              </motion.div>
            </div>
          );
        })}
      </motion.div>
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ opacity: shade }}
      >
        <div
          className={cn(
            'flex items-center gap-1 bg-linear-to-b from-black/50 to-transparent px-2 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pb-6 pl-[max(0.5rem,env(safe-area-inset-left))] text-white transition-opacity duration-200',
            chrome ? 'opacity-100' : 'opacity-0',
          )}
        >
          <button
            type="button"
            aria-label="Close"
            data-zone-gesture="disabled"
            className={cn(
              'grid size-11 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white',
              chrome ? 'pointer-events-auto' : 'pointer-events-none',
            )}
            onClick={close}
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
          {photo === undefined ? null : (
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold">
                {DAY.format(photo.taken)}
              </span>
              <span className="text-xs text-white/60 tabular-nums">
                {TIME.format(photo.taken)}
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
