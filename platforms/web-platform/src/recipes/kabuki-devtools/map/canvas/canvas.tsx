import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { ink } from '../../ink/index.ts';

/*
 * A surface to pan and zoom a drawing on, sized by whatever holds it. Knows
 * nothing of what it draws.
 *
 * 1. Place   at 100%, never zoomed in: centred if the whole drawing fits,
 *            else centred across with its top a little below the surface's,
 *            running down. From then on it stays where the reader leaves
 *            it: the surface never moves by itself, but when it is resized
 *            what was at its centre stays at its centre.
 * 2. Pan     drag with a finger or the pointer, from anywhere, over what is
 *            drawn too: a press becomes a drag once it moves, and the click
 *            it would have made is swallowed. A press that stays put clicks
 *            what it is on.
 * 3. Zoom    scroll, pinch, or the buttons; always about a point, so what
 *            is under it stays there.
 * 4. Fit     the whole drawing in view, on demand; or, when following,
 *            every time the drawing changes, with no buttons to steer it.
 * 5. Tap     a tap on the surface itself, not on anything drawn (marked
 *            `ITEM`), says so.
 *            A right click never opens the browser's menu here.
 *
 * What is drawn marked `OWN` handles its own scrolls: the surface leaves
 * them alone.
 */

export interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const MIN = 0.25;
const MAX = 2.5;
const PAD = 56;
/** The room left round the drawing while following it: it is all there is to see. */
const FOLLOW_PAD = 24;
/** Room above the root when the Map first opens too tall to fit, in pixels. */
const TOP = 100;
const SPRING = { type: 'spring', duration: 0.45, bounce: 0 } as const;

const clamp = (scale: number) => Math.min(MAX, Math.max(MIN, scale));

/** Spread on what handles its own presses and scrolls, such as a list that scrolls. */
export const OWN = { 'data-canvas-own': '' } as const;
const isOwn = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-canvas-own]') !== null;

/** Spread on what is drawn, so a tap on it is not a tap on the surface. */
export const ITEM = { 'data-canvas-item': '' } as const;
const isItem = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-canvas-item]') !== null;

/** How far a pointer may move and still tap. */
const SLOP = 4;

export function Canvas({
  bounds,
  label,
  onTap,
  dotted = true,
  follow = false,
  children,
}: {
  /** What the drawing covers, for Fit. */
  readonly bounds: Bounds;
  readonly label: string;
  /** Dots under the drawing; without them, whatever is behind shows through. */
  readonly dotted?: boolean;
  /** Keep the whole drawing in view as it changes, with no controls: for presenting. */
  readonly follow?: boolean;
  /** The surface was tapped, away from anything drawn. */
  readonly onTap: () => void;
  /** The drawing, its origin at 0, 0. */
  readonly children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(TOP);
  const scale = useMotionValue(1);

  /** Scale to `next` about a point on the surface. */
  const zoomAt = (next: number, px: number, py: number, smooth = false) => {
    const to = clamp(next);
    const ratio = to / scale.get();
    const nx = px - (px - x.get()) * ratio;
    const ny = py - (py - y.get()) * ratio;
    if (smooth) {
      animate(scale, to, SPRING);
      animate(x, nx, SPRING);
      animate(y, ny, SPRING);
    } else {
      scale.set(to);
      x.set(nx);
      y.set(ny);
    }
  };

  // 1. Place, once, from the drawing as it first is.
  useEffect(() => {
    const element = surface.current!;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const fits = bounds.bottom - bounds.top <= height - PAD * 2;
    scale.set(1);
    x.set(width / 2 - (bounds.left + bounds.right) / 2);
    y.set(
      fits ? height / 2 - (bounds.top + bounds.bottom) / 2 : TOP - bounds.top,
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- placed once, where the drawing first is; later it stays where the reader leaves it.
  }, [x, y, scale]);

  // 1. Place: a resize keeps the centre where it was.
  useEffect(() => {
    const element = surface.current!;
    let width = element.clientWidth;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      x.set(x.get() + (element.clientWidth - width) / 2);
      y.set(y.get() + (element.clientHeight - height) / 2);
      width = element.clientWidth;
      height = element.clientHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [x, y]);

  // 3. Zoom, from the wheel: a passive listener could not stop the page scrolling.
  useEffect(() => {
    const element = surface.current!;
    const onWheel = (event: WheelEvent) => {
      if (isOwn(event.target)) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      // A trackpad's pinch comes as a wheel with Ctrl, in much smaller steps.
      const rate = event.ctrlKey ? 0.01 : 0.002;
      zoomAt(
        scale.get() * Math.exp(-event.deltaY * rate),
        event.clientX - box.left,
        event.clientY - box.top,
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  });

  // 2. Pan and 3. Zoom, from fingers and the pointer.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** The press so far: where it began, whether it became a drag, and whether it began on the bare surface. */
  const press = useRef<
    { x: number; y: number; dragging: boolean; bare: boolean } | undefined
  >(undefined);
  /** A drag just ended: the click it makes is not one. */
  const dragged = useRef(false);
  const pinch = useRef<{ distance: number; scale: number } | undefined>(
    undefined,
  );
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
      mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    // Only the main button pans: a right click is the card's.
    if (event.button !== 0) return;
    dragged.current = false;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1)
      press.current = {
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        bare: !isItem(event.target),
      };
    else {
      // A second finger: a pinch, never a click.
      if (press.current) press.current.dragging = true;
      for (const id of pointers.current.keys())
        event.currentTarget.setPointerCapture(id);
      if (pointers.current.size === 2)
        pinch.current = { distance: spread().distance, scale: scale.get() };
    }
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const was = pointers.current.get(event.pointerId);
    if (!was) return;
    const now = { x: event.clientX, y: event.clientY };
    const held = press.current;
    if (held && !held.dragging) {
      // Still a click until it moves far enough.
      if (Math.hypot(now.x - held.x, now.y - held.y) < SLOP) return;
      held.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (pointers.current.size === 1) {
      x.set(x.get() + now.x - was.x);
      y.set(y.get() + now.y - was.y);
    }
    pointers.current.set(event.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const { distance, mid } = spread();
      const box = surface.current!.getBoundingClientRect();
      zoomAt(
        (pinch.current.scale * distance) / pinch.current.distance,
        mid.x - box.left,
        mid.y - box.top,
      );
    }
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size < 2) pinch.current = undefined;
    if (pointers.current.size > 0) return;
    const held = press.current;
    press.current = undefined;
    if (!held) return;
    if (held.dragging) dragged.current = true;
    // 5. Tap
    else if (held.bare && event.type === 'pointerup') onTap();
  };
  const onClickCapture = (event: React.MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

  const zoomBy = (factor: number) => {
    const element = surface.current!;
    zoomAt(
      scale.get() * factor,
      element.clientWidth / 2,
      element.clientHeight / 2,
      true,
    );
  };

  // 4. Fit
  const fit = () => {
    const element = surface.current!;
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const pad = follow ? FOLLOW_PAD : PAD;
    const to = clamp(
      Math.min(
        1.25,
        (element.clientWidth - pad * 2) / Math.max(1, width),
        (element.clientHeight - pad * 2) / Math.max(1, height),
      ),
    );
    animate(scale, to, SPRING);
    animate(
      x,
      element.clientWidth / 2 - ((bounds.left + bounds.right) / 2) * to,
      SPRING,
    );
    animate(
      y,
      element.clientHeight / 2 - ((bounds.top + bounds.bottom) / 2) * to,
      SPRING,
    );
  };

  // 4. Fit, following the drawing as it grows and shrinks.
  useEffect(() => {
    if (follow) fit();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- refits only when what is drawn moves its edges.
  }, [follow, bounds.left, bounds.right, bounds.top, bounds.bottom]);

  return (
    <div
      ref={surface}
      role="application"
      aria-label={label}
      // Clipped, never hidden: a hidden overflow still scrolls to whatever takes focus, and the drawing would jump.
      className="relative h-full w-full cursor-grab touch-none overflow-clip select-none active:cursor-grabbing"
      style={
        dotted
          ? {
              backgroundImage: `radial-gradient(${ink('grain')} 1px, transparent 1px)`,
              backgroundSize: '20px 20px',
            }
          : undefined
      }
      // No browser menu anywhere on the Map: a right click is the Map's own.
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <motion.div
        className="absolute top-0 left-0 origin-top-left"
        style={{ x, y, scale }}
      >
        {children}
      </motion.div>
      {!follow && (
        <div
          {...ITEM}
          className="bg-background/85 absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border shadow-xs backdrop-blur-sm"
        >
          <Control label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus />
          </Control>
          <Control label="Zoom out" onClick={() => zoomBy(0.8)}>
            <Minus />
          </Control>
          <Control label="Fit everything" onClick={fit}>
            <Maximize />
          </Control>
        </div>
      )}
    </div>
  );
}

function Control({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring grid size-9 place-items-center transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
