import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { SWIPE_DISMISS } from '@kestack/web-platform/recipes/touch-layers';
import {
  GestureProvider,
  GestureZone,
  type Pointer,
  type Pointers,
  useGesture,
} from '@kestack/web-platform/ui/input';
import { MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

/*
 * An image opened whole: over the page, on a dark backdrop, fitted to the
 * screen, then zoomed and moved about.
 *
 * On touch, two fingers pinch it, about the point between them, and move
 * it as they go; a double tap zooms in on where it lands, or back out; one
 * finger moves it while zoomed. Not zoomed, one finger takes it down: it
 * follows the finger and the backdrop fades, and let go past the Touch
 * Layers' `SWIPE_DISMISS`, 80px or a flick of 500px/s, it closes; let go
 * short, it springs back. The touches are a Gesture Zone's, as a Drawer's
 * are.
 *
 * With a mouse or a trackpad, the wheel or a pinch zooms about the
 * pointer, a double click zooms in or back out, and a drag moves it while
 * zoomed. The buttons at the top zoom out, back to fit (saying how far it
 * is zoomed), and in, as `-`, `0` and `+` do; Escape, the close button or
 * a click on the backdrop close it. Zoomed out past fit, or moved past its
 * edges, it settles back once let go.
 */

/** As far in as it zooms: eight times its fitted size. */
const MAX = 8;
/** How far a double tap, or a double click, zooms in. */
const DOUBLE = 2.5;
/** How far a button or key zooms, each press. */
const STEP = 1.5;
/** Within this many ms and px of the last, a tap is the second of two. */
const DOUBLE_MS = 300;
const DOUBLE_PX = 24;
/** Moved less than this many px, a touch is a tap. */
const TAP_PX = 8;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function ImageViewer({
  src,
  onClose,
}: {
  /** The image shown, or null while none is. */
  readonly src: string | null;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open={src !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        // Its own backdrop fades as it is swiped away: not the dialog's.
        data-image-viewer
        showCloseButton={false}
        className="inset-0 top-0 left-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none bg-transparent p-0 ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Image</DialogTitle>
        {src !== null && <Stage src={src} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** Where the image is: scaled from its fitted size, and moved from the centre. */
type Place = { readonly scale: number; readonly x: number; readonly y: number };

function Stage({
  src,
  onClose,
}: {
  readonly src: string;
  readonly onClose: () => void;
}) {
  const reduced = useReducedMotion() === true;
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const backdrop = useMotionValue(1);
  // How far it is zoomed, or is going to be once it settles, as said.
  const [zoom, setZoom] = useState(1);

  const now = (): Place => ({ scale: scale.get(), x: x.get(), y: y.get() });
  const set = (place: Place) => {
    setZoom(place.scale);
    scale.jump(place.scale);
    x.jump(place.x);
    y.jump(place.y);
  };
  const glide = async (value: MotionValue<number>, to: number) => {
    if (reduced) return value.jump(to);
    await animate(value, to, { type: 'spring', stiffness: 400, damping: 40 });
  };

  /** The stage's centre, which the image is fitted about, in viewport px. */
  const centre = () => {
    const box = stage.current?.getBoundingClientRect();
    return box === undefined
      ? { x: innerWidth / 2, y: innerHeight / 2 }
      : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  /** Kept within fit and `MAX`, its edges never inside the screen's once bigger. */
  const settled = ({ scale: s, x: left, y: top }: Place): Place => {
    const next = clamp(s, 1, MAX);
    const box = stage.current?.getBoundingClientRect();
    const fitted = image.current;
    if (box === undefined || fitted === null)
      return { scale: next, x: 0, y: 0 };
    const spareX = Math.max(0, (fitted.offsetWidth * next - box.width) / 2);
    const spareY = Math.max(0, (fitted.offsetHeight * next - box.height) / 2);
    return {
      scale: next,
      x: clamp(left, -spareX, spareX),
      y: clamp(top, -spareY, spareY),
    };
  };
  const settle = (place: Place = now()) => {
    const to = settled(place);
    setZoom(to.scale);
    void glide(scale, to.scale);
    void glide(x, to.x);
    void glide(y, to.y);
    void glide(backdrop, 1);
  };
  /** Scaled to `next`, the point under `at` (viewport px) staying under it. */
  const about = (from: Place, next: number, at = centre()): Place => {
    const middle = centre();
    const ratio = next / from.scale;
    return {
      scale: next,
      x: at.x - middle.x - (at.x - middle.x - from.x) * ratio,
      y: at.y - middle.y - (at.y - middle.y - from.y) * ratio,
    };
  };
  const zoomTo = (next: number, at?: { x: number; y: number }) =>
    settle(about(now(), clamp(next, 1, MAX), at));
  /** In on `at`, or back to fit when zoomed. */
  const toggle = (at: { x: number; y: number }) =>
    scale.get() > 1.01 ? settle({ scale: 1, x: 0, y: 0 }) : zoomTo(DOUBLE, at);
  /** Down and out, the backdrop with it, then closed. */
  const dismiss = () => {
    void glide(backdrop, 0);
    void glide(y, y.get() >= 0 ? innerHeight : -innerHeight).then(onClose);
  };

  const touched: Touched = {
    zoomed: () => scale.get() > 1.01,
    now,
    set,
    about,
    settle,
    toggle,
    dismiss,
    swiped: (offset) => {
      y.jump(offset);
      backdrop.jump(1 - Math.min(1, Math.abs(offset) / 400));
    },
  };

  // The wheel, or a trackpad's pinch, which comes as a wheel with Ctrl:
  // kept from the page, which would zoom or scroll behind.
  useEffect(() => {
    const element = stage.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 16 : 1;
      const factor = Math.exp(
        (-event.deltaY * lines) / (event.ctrlKey ? 100 : 400),
      );
      const next = clamp(scale.get() * factor, 1, MAX);
      set(settled(about(now(), next, { x: event.clientX, y: event.clientY })));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  });

  // A mouse's drag moves it while zoomed; a Gesture is only ever a touch's.
  const drag = useRef<{ id: number; x: number; y: number; from: Place } | null>(
    null,
  );
  const lastPointer = useRef('mouse');
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    lastPointer.current = event.pointerType;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (scale.get() <= 1.01) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: now(),
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (held === null || held.id !== event.pointerId) return;
    set(
      settled({
        scale: held.from.scale,
        x: held.from.x + event.clientX - held.x,
        y: held.from.y + event.clientY - held.y,
      }),
    );
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') zoomTo(scale.get() * STEP);
    else if (event.key === '-' || event.key === '_') zoomTo(scale.get() / STEP);
    else if (event.key === '0') settle({ scale: 1, x: 0, y: 0 });
    else return;
    event.preventDefault();
  };

  return (
    <GestureProvider>
      <GestureZone
        className="relative h-full w-full touch-none overflow-hidden select-none"
        onKeyDown={onKeyDown}
      >
        <Touch image={touched} />
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-black/90"
          style={{ opacity: backdrop }}
        />
        <div
          ref={stage}
          // A click on the backdrop, not on the image, closes it.
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`absolute inset-0 grid place-items-center ${zoom > 1.01 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <motion.img
            ref={image}
            src={src}
            alt=""
            draggable={false}
            onDoubleClick={(event) => {
              // A double tap is the touch's own, below.
              if (lastPointer.current === 'touch') return;
              toggle({ x: event.clientX, y: event.clientY });
            }}
            style={{ scale, x, y }}
            className={`max-h-dvh max-w-full object-contain ${zoom > 1.01 ? '' : 'cursor-zoom-in'}`}
          />
        </div>
        <div
          // Its buttons are tapped, never part of a Gesture.
          data-zone-gesture="disabled"
          className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/60 p-1 text-white/90 [padding-top:max(0.25rem,env(safe-area-inset-top))]"
        >
          <Tool
            label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => zoomTo(scale.get() / STEP)}
          >
            <MinusIcon />
          </Tool>
          <button
            type="button"
            aria-label="Fit to screen"
            title="Fit to screen"
            onClick={() => settle({ scale: 1, x: 0, y: 0 })}
            className="focus-ring h-11 min-w-14 rounded-full px-2 text-xs tabular-nums hover:bg-white/15 keyboard:h-8"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Tool
            label="Zoom in"
            disabled={zoom >= MAX}
            onClick={() => zoomTo(scale.get() * STEP)}
          >
            <PlusIcon />
          </Tool>
          <Tool label="Close" onClick={onClose}>
            <XIcon />
          </Tool>
        </div>
      </GestureZone>
    </GestureProvider>
  );
}

function Tool({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring grid size-11 place-items-center rounded-full transition-colors duration-150 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent keyboard:size-8 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

/** What the image's touches move it by. */
type Touched = {
  readonly zoomed: () => boolean;
  readonly now: () => Place;
  readonly set: (place: Place) => void;
  readonly about: (
    from: Place,
    next: number,
    at: { x: number; y: number },
  ) => Place;
  readonly settle: () => void;
  readonly toggle: (at: { x: number; y: number }) => void;
  readonly dismiss: () => void;
  readonly swiped: (offset: number) => void;
};

/**
 * The image's touches, as one Gesture at a time: a pinch, a move while
 * zoomed, a swipe away while not, or a double tap. Each time a finger lands
 * or lifts, what the fingers down do is read again from where the image is
 * then, so a pinch that loses a finger goes on as a move. Drawn inside the
 * Gesture Zone, as its hook must be, it draws nothing.
 */
function Touch({ image }: { readonly image: Touched }) {
  type Hold =
    | {
        readonly as: 'pinch';
        readonly from: Place;
        readonly fingers: readonly [Pointer, Pointer];
        readonly gap: number;
        readonly mid: { x: number; y: number };
      }
    | {
        readonly as: 'move';
        readonly from: Place;
        readonly finger: Pointer;
        readonly at: { x: number; y: number };
      }
    | { readonly as: 'swipe'; readonly finger: Pointer; readonly at: number };
  const hold = useRef<Hold | null>(null);
  const frame = useRef(0);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const down = (pointers: Pointers) =>
    [...pointers.values()].filter((each) => each.end === undefined);
  const point = (finger: Pointer) => ({ x: finger.x.get(), y: finger.y.get() });

  /**
   * What the fingers down do, from where the image is now. The last finger
   * lifting is heard before the Gesture ends, with none down: what they did
   * is kept, so the end can still tell a swipe away.
   */
  const take = (pointers: Pointers) => {
    const [first, second] = down(pointers);
    if (first !== undefined && second !== undefined) {
      const a = point(first);
      const b = point(second);
      hold.current = {
        as: 'pinch',
        from: image.now(),
        fingers: [first, second],
        gap: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    } else if (first !== undefined)
      hold.current = image.zoomed()
        ? { as: 'move', from: image.now(), finger: first, at: point(first) }
        : { as: 'swipe', finger: first, at: first.y.get() - image.now().y };
  };

  /** Every frame while fingers are down: the image where they put it. */
  const follow = () => {
    const now = hold.current;
    if (now?.as === 'pinch') {
      const [a, b] = now.fingers.map(point) as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const gap = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Past either end it gives, less and less, then settles back once let go.
      const raw = now.from.scale * (gap / now.gap);
      const next =
        raw < 1 ? 1 - (1 - raw) / 2 : raw > MAX ? MAX + (raw - MAX) / 4 : raw;
      const zoomed = image.about(now.from, next, now.mid);
      image.set({
        scale: next,
        x: zoomed.x + mid.x - now.mid.x,
        y: zoomed.y + mid.y - now.mid.y,
      });
    } else if (now?.as === 'move') {
      const at = point(now.finger);
      image.set({
        scale: now.from.scale,
        x: now.from.x + at.x - now.at.x,
        y: now.from.y + at.y - now.at.y,
      });
    } else if (now?.as === 'swipe') image.swiped(now.finger.y.get() - now.at);
    frame.current = requestAnimationFrame(follow);
  };

  useGesture({
    // The whole screen is the image's: every way it moves.
    directions: 'all',
    onStart: (pointers) => {
      take(pointers);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(follow);
    },
    onPointer: (_pointer, pointers) => take(pointers),
    onEnd: (pointers, { interrupted, preventClick }) => {
      cancelAnimationFrame(frame.current);
      const was = hold.current;
      hold.current = null;
      const all = [...pointers.values()];
      const [only] = all;
      if (interrupted || only === undefined) return image.settle();
      // 1. A swipe down, or up, far or fast enough: away.
      if (was?.as === 'swipe' && all.length === 1) {
        const moved = Math.abs(only.dy.get());
        const speed = Math.abs(only.dy.getVelocity());
        if (
          moved >= SWIPE_DISMISS.distance ||
          speed >= SWIPE_DISMISS.velocity
        ) {
          preventClick();
          return image.dismiss();
        }
      }
      // 2. A tap, the second of two close together: zoom in there, or out.
      const tapped =
        all.length === 1 &&
        Math.hypot(only.dx.get(), only.dy.get()) < TAP_PX &&
        only.end !== undefined;
      if (tapped) {
        const at = { x: only.start.x, y: only.start.y };
        const last = lastTap.current;
        const t = performance.now();
        if (
          last !== null &&
          t - last.t < DOUBLE_MS &&
          Math.hypot(at.x - last.x, at.y - last.y) < DOUBLE_PX
        ) {
          lastTap.current = null;
          preventClick();
          return image.toggle(at);
        }
        lastTap.current = { t, ...at };
      } else {
        lastTap.current = null;
        preventClick();
      }
      image.settle();
    },
  });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return null;
}
