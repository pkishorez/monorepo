import { useEffect, useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { Maximize, Minus, Plus } from '#lib/lucide';
import { Button } from '#components/ui/button';

const MIN = 0.2;
const MAX = 2.5;
const SLOP = 4;
const TOP = 56;
const BOTTOM = 44;
const clamp = (k: number) => Math.min(MAX, Math.max(MIN, k));

/**
 * A surface that pans and zooms what is drawn on it: drag to pan; scroll,
 * pinch or the buttons to zoom, at the pointer or the middle; Fit to see it
 * all. What is drawn has x 0
 * in its middle, which fitting puts in the surface's middle: once, when
 * first shown, and on Fit. A press that does not move is a click: on the
 * content it reaches the content, on the empty surface it calls
 * `onBackground`.
 */
export const Canvas = ({
  width,
  height,
  onBackground,
  overlay,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly onBackground: () => void;
  /** Drawn over the surface, not moved by it. */
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const k = useMotionValue(1);
  const size = useRef({ width, height });
  size.current = { width, height };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);

  const zoomAt = (px: number, py: number, factor: number) => {
    const was = k.get();
    const next = clamp(was * factor);
    x.set(px - (px - x.get()) * (next / was));
    y.set(py - (py - y.get()) * (next / was));
    k.set(next);
  };

  const fit = (smooth: boolean) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const { width: w, height: h } = size.current;
    // Room for what is drawn over the surface: the bar on top, the zoom below.
    const room = { width: box.width - 16, height: box.height - TOP - BOTTOM };
    const next = clamp(Math.min(room.width / w, room.height / h, 1.1));
    const to = {
      x: box.width / 2,
      y: TOP + Math.max((room.height - h * next) / 2, 0),
      k: next,
    };
    const go = (value: typeof x, target: number) =>
      smooth
        ? animate(value, target, { duration: 0.35, ease: [0.23, 1, 0.32, 1] })
        : value.set(target);
    go(x, to.x);
    go(y, to.y);
    go(k, to.k);
  };

  // A window listener can't be passive and still keep the page from
  // scrolling, and the first fit needs the surface's size: both are effects.
  useEffect(() => {
    const surface = ref.current!;
    let fitted = false;
    const observer = new ResizeObserver(() => {
      if (fitted) return;
      fitted = true;
      fit(false);
    });
    observer.observe(surface);
    // Scrolling and pinching (a trackpad pinch arrives as Ctrl-scroll) zoom
    // the map at the pointer, never the page.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const line = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const rate = event.ctrlKey ? 0.01 : 0.002;
      const box = surface.getBoundingClientRect();
      zoomAt(
        event.clientX - box.left,
        event.clientY - box.top,
        Math.exp(-event.deltaY * line * rate),
      );
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      surface.removeEventListener('wheel', onWheel);
    };
    // The surface is mounted once; fit and zoomAt read refs and motion values.
  }, []);

  const onPointerDown = (event: PointerEvent) => {
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1) dragged.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const was = pointers.current.get(event.pointerId);
    if (!was) return;
    const now = { x: event.clientX, y: event.clientY };
    const all = [...pointers.current.values()];
    if (
      !dragged.current &&
      Math.hypot(now.x - was.x, now.y - was.y) < SLOP &&
      all.length === 1
    )
      return;
    if (!dragged.current) {
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const other = [...pointers.current].find(
      ([id]) => id !== event.pointerId,
    )?.[1];
    if (!other) {
      x.set(x.get() + now.x - was.x);
      y.set(y.get() + now.y - was.y);
    } else if (pointers.current.size === 2) {
      // Two fingers: their middle pans, the distance between them zooms.
      const box = event.currentTarget.getBoundingClientRect();
      const mid = (a: typeof now) => ({
        x: (a.x + other.x) / 2,
        y: (a.y + other.y) / 2,
      });
      const apart = (a: typeof now) => Math.hypot(a.x - other.x, a.y - other.y);
      const from = mid(was);
      const to = mid(now);
      x.set(x.get() + to.x - from.x);
      y.set(y.get() + to.y - from.y);
      if (apart(was) > 0)
        zoomAt(to.x - box.left, to.y - box.top, apart(now) / apart(was));
    }
    pointers.current.set(event.pointerId, now);
  };
  const onPointerUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
  };

  const zoomBy = (factor: number) => {
    const box = ref.current!.getBoundingClientRect();
    zoomAt(box.width / 2, box.height / 2, factor);
  };

  return (
    <div
      ref={ref}
      className="relative h-full touch-none overflow-hidden bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[20px_20px] select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(event) => {
        if (dragged.current) {
          event.stopPropagation();
          dragged.current = false;
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onBackground();
      }}
    >
      <motion.div
        className="absolute top-0 left-0"
        style={{ x, y, scale: k, originX: 0, originY: 0, width, height }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onBackground();
        }}
      >
        {children}
      </motion.div>
      {overlay}
      <div className="absolute right-3 bottom-3 flex gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.25)}
        >
          <Minus />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.25)}
        >
          <Plus />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Fit to view"
          onClick={() => fit(true)}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
};
