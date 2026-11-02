import { Dialog } from '@base-ui/react/dialog';
import {
  GestureProvider,
  GestureZone,
  type Pointer,
  type Pointers,
  useGesture,
} from '../../ui/input/index.ts';
import { SWIPE_DISMISS } from '../touch-layers/index.ts';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
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
import { createPortal } from 'react-dom';

/*
 * An image opened whole: over the page, on a dimmed and blurred backdrop,
 * fitted inside a margin and framed, so where it ends is plain, then
 * zoomed and moved about. Opened among others, as the images of one tool
 * call, it says which of them it is, "2 of 5", and moves to the one before
 * or after: by a swipe left or right on touch, the image following the
 * finger and the next sliding in; by the arrows at its sides or the arrow
 * keys otherwise. Its buttons and count show while it is being used, and
 * fade once it is left alone.
 *
 * On touch, two fingers pinch it, about the point between them, and move
 * it as they go; a double tap zooms in on where it lands, or back out; one
 * finger moves it while zoomed. Not zoomed, one finger takes it up or down:
 * it follows the finger and the backdrop fades, and let go past the Touch
 * Layers' `SWIPE_DISMISS`, 80px or a flick of 500px/s, it closes; let go
 * short, it springs back. Sideways, among others, the same distance or
 * flick moves to the next one; alone, it only gives a little. The touches are a Gesture Zone's, as a Drawer's
 * are.
 *
 * With a mouse or a trackpad, the wheel or a pinch zooms about the
 * pointer, a double click zooms in or back out, and a drag moves it while
 * zoomed. The buttons at the top zoom out, back to fit (saying how far it
 * is zoomed), and in, as `-`, `0` and `+` do; Escape, the close button or
 * a click on the backdrop close it. Zoomed out past fit, or moved past its
 * edges, it settles back once let go.
 *
 * However it closes, it is gone at once, its buttons and backdrop with
 * it, and the page under is the page's again. Swiped away, only the image
 * goes on sliding off, over the page and out of its way, unless motion is
 * reduced.
 *
 * `ImageViewer` is the viewer, opened on an image by its caller;
 * `ImageButton` is a thumbnail, or anything, that opens it on a tap.
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
/** Left alone this long, in ms, its buttons and count fade. */
const IDLE_MS = 2500;
/**
 * Moving to the next image: the one shown carries on off the screen, as
 * the swipe that sent it was going, in 120ms; the next comes in from a
 * third of the way across, easing out, in 200ms. Fast enough to keep up
 * with a finger, never a slide to wait on.
 */
const OUT = {
  type: 'tween',
  duration: 0.12,
  ease: [0.23, 1, 0.32, 1],
} as const;
const IN = { type: 'tween', duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
const SLIDE_IN = 0.33;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The viewer, over the page while `src` is an image and gone at once when
 * it is null; `onClose` is called as the reader closes it.
 */
export function ImageViewer({
  src,
  onClose,
  images,
  onShow,
}: {
  /** The image shown, or null while none is. */
  readonly src: string | null;
  readonly onClose: () => void;
  /** Every image it moves between, `src` among them, in order; omitted, it shows `src` alone. */
  readonly images?: ReadonlyArray<string>;
  /** Shows another of `images`, as the reader moves to it. */
  readonly onShow?: (src: string) => void;
}) {
  const reduced = useReducedMotion() === true;
  const at = src === null || images === undefined ? -1 : images.indexOf(src);
  const total = images?.length ?? 0;
  const among = at >= 0 && total > 1 && onShow !== undefined;
  // The image moved to, and from which side: it slides in from there.
  // Opened afresh, it is none, and the image is simply there.
  const [arrived, setArrived] = useState<{
    readonly src: string;
    readonly by: -1 | 1;
  } | null>(null);
  const from = arrived !== null && arrived.src === src ? arrived.by : 0;
  // The first and the last are the ends: nothing past them.
  const edges = { before: among && at > 0, after: among && at < total - 1 };
  const step = (by: -1 | 1) => {
    if (!among || images === undefined) return;
    const next = images[at + by];
    if (next === undefined) return;
    setArrived({ src: next, by });
    onShow(next);
  };
  const close = () => {
    setArrived(null);
    onClose();
  };
  // The image swiped away, sliding off from where the finger left it.
  const [leaving, setLeaving] = useState<Leave | null>(null);
  const swiped = (place: Place) => {
    if (src !== null && !reduced) setLeaving({ src, ...place });
    close();
  };
  return (
    <>
      <Dialog.Root
        open={src !== null}
        onOpenChange={(next) => !next && close()}
      >
        {/* No dialog backdrop: its own fades as it is swiped away. */}
        <Dialog.Portal>
          <Dialog.Popup
            data-slot="image-viewer"
            // Closed, it goes at once, with no fade for its buttons to linger in.
            className="fixed inset-0 z-50 h-dvh w-screen outline-none data-closed:hidden"
          >
            <Dialog.Title className="sr-only">Image</Dialog.Title>
            {src !== null && (
              <Canvas
                key={src}
                src={src}
                from={reduced ? 0 : from}
                count={among ? { at: at + 1, total } : null}
                edges={edges}
                onStep={among ? step : null}
                onClose={close}
                onSwiped={swiped}
              />
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {leaving !== null && src === null && (
        <Leaving leave={leaving} onGone={() => setLeaving(null)} />
      )}
    </>
  );
}

/**
 * Opens the viewer on `src` when pressed, as a thumbnail does: its
 * children are what is pressed, `label` what it says to a screen reader.
 */
export function ImageButton({
  src,
  label,
  className = '',
  children,
}: {
  readonly src: string;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`focus-ring block cursor-zoom-in ${className}`}
      >
        {children}
      </button>
      <ImageViewer src={open ? src : null} onClose={() => setOpen(false)} />
    </>
  );
}

/** An image swiped away: what it is, and where it was let go. */
type Leave = Place & { readonly src: string };

/**
 * The image swiped away, sliding the rest of the way off once the viewer
 * has closed: over the page, but never in the way of a touch or a click.
 */
function Leaving({
  leave,
  onGone,
}: {
  readonly leave: Leave;
  readonly onGone: () => void;
}) {
  const y = useMotionValue(leave.y);
  useEffect(() => {
    const away = animate(y, leave.y >= 0 ? innerHeight : -innerHeight, {
      type: 'spring',
      stiffness: 400,
      damping: 40,
    });
    void away.then(onGone);
    return () => away.stop();
    // Once, from where it was let go.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div
      aria-hidden
      data-image-leaving
      className="pointer-events-none fixed top-0 left-0 z-50 grid h-dvh w-screen place-items-center"
    >
      <motion.img
        src={leave.src}
        alt=""
        style={{ scale: leave.scale, x: leave.x, y }}
        className="max-h-dvh max-w-full object-contain"
      />
    </div>,
    document.body,
  );
}

/** Where the image is: scaled from its fitted size, and moved from the centre. */
type Place = { readonly scale: number; readonly x: number; readonly y: number };

/** The image on its backdrop, with its buttons: zoomed and moved, or taken away. */
function Canvas({
  src,
  from,
  count,
  edges,
  onStep,
  onClose,
  onSwiped,
}: {
  readonly src: string;
  /** The side it slides in from: the next one's, the one before's, or none. */
  readonly from: -1 | 0 | 1;
  /** Which of the images it is, among more than one. */
  readonly count: { readonly at: number; readonly total: number } | null;
  /** Whether there is an image before it, and after it. */
  readonly edges: { readonly before: boolean; readonly after: boolean };
  /** Moves to the image before or after; null when it is alone. */
  readonly onStep: ((by: -1 | 1) => void) | null;
  readonly onClose: () => void;
  /** Swiped away: closed, the image left to slide off from where it is. */
  readonly onSwiped: (place: Place) => void;
}) {
  const reduced = useReducedMotion() === true;
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(from === 0 ? 0 : from * innerWidth * SLIDE_IN);
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
  /** Closed now, the image left to slide off the rest of the way. */
  const dismiss = () => onSwiped(now());
  /** Whether there is an image that way: -1 the one before, 1 the one after. */
  const can = (by: -1 | 1) =>
    onStep !== null && (by < 0 ? edges.before : edges.after);
  /**
   * To the image before or after: this one carries on the way it was
   * going, off the screen, then the next one comes in. Past the first or
   * the last, it springs back where it was.
   */
  const step = (by: -1 | 1) => {
    if (onStep === null || !can(by)) return settle();
    if (reduced) return onStep(by);
    void animate(x, -by * innerWidth, OUT).then(() => onStep(by));
  };
  // Slid in from the side it came from.
  useEffect(() => {
    if (from !== 0 && !reduced) void animate(x, 0, IN);
    // Once, as it comes in.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. Its buttons and count, while it is being used.
  const [shown, setShown] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = () => {
    setShown(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setShown(false), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => clearTimeout(idle.current);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Towards an image there is, it follows the finger; past an end, it gives a little.
    slid: (offset) => x.jump(can(offset < 0 ? 1 : -1) ? offset : offset / 4),
    step,
    wake,
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
    wake();
    if (event.key === 'ArrowRight' && can(1)) step(1);
    else if (event.key === 'ArrowLeft' && can(-1)) step(-1);
    else if (event.key === '+' || event.key === '=') zoomTo(scale.get() * STEP);
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
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse') wake();
        }}
        onPointerDown={wake}
      >
        <Touch image={touched} />
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-black/70 backdrop-blur-xl"
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
          className={`absolute inset-0 grid place-items-center p-4 [padding-top:max(1rem,env(safe-area-inset-top))] [padding-bottom:max(1rem,env(safe-area-inset-bottom))] sm:p-14 ${zoom > 1.01 ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
            className={`max-h-[calc(100dvh-2rem)] max-w-full rounded-lg object-contain sm:max-h-[calc(100dvh-7rem)] shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_12px_48px_rgb(0_0_0/0.5)] ${zoom > 1.01 ? '' : 'cursor-zoom-in'}`}
          />
        </div>
        {count !== null && (
          <div
            aria-live="polite"
            data-shown={shown ? '' : undefined}
            className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/90 tabular-nums opacity-0 transition-opacity duration-200 [margin-top:env(safe-area-inset-top)] data-shown:opacity-100 motion-reduce:transition-none"
          >
            {count.at} of {count.total}
          </div>
        )}
        {can(-1) && <Side side="left" shown={shown} onClick={() => step(-1)} />}
        {can(1) && <Side side="right" shown={shown} onClick={() => step(1)} />}
        <div
          // Its buttons are tapped, never part of a Gesture.
          data-zone-gesture="disabled"
          data-shown={shown ? '' : undefined}
          onFocus={wake}
          className="pointer-events-none absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/60 p-1 text-white/90 opacity-0 transition-opacity duration-200 [margin-top:env(safe-area-inset-top)] focus-within:pointer-events-auto focus-within:opacity-100 data-shown:pointer-events-auto data-shown:opacity-100 motion-reduce:transition-none"
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

/** The arrow to the image before or after, at its side, while it is being used. */
function Side({
  side,
  shown,
  onClick,
}: {
  readonly side: 'left' | 'right';
  readonly shown: boolean;
  readonly onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  const label = side === 'left' ? 'Previous image' : 'Next image';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-zone-gesture="disabled"
      data-shown={shown ? '' : undefined}
      onClick={onClick}
      className={`focus-ring pointer-events-none absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/90 opacity-0 transition-[opacity,background-color] duration-200 hover:bg-black/75 focus-visible:pointer-events-auto focus-visible:opacity-100 data-shown:pointer-events-auto data-shown:opacity-100 max-sm:hidden motion-reduce:transition-none [&_svg]:size-5 ${side === 'left' ? 'left-3' : 'right-3'}`}
    >
      <Icon aria-hidden />
    </button>
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
  /** Followed sideways by `offset` px: towards the next image, or a little, alone. */
  readonly slid: (offset: number) => void;
  /** To the image before or after. */
  readonly step: (by: -1 | 1) => void;
  /** Its buttons and count show again. */
  readonly wake: () => void;
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
    | {
        readonly as: 'swipe';
        readonly finger: Pointer;
        readonly at: { x: number; y: number };
        /** Which way it goes, once the finger has moved enough to tell. */
        axis: 'x' | 'y' | null;
      };
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
        : {
            as: 'swipe',
            finger: first,
            at: {
              x: first.x.get() - image.now().x,
              y: first.y.get() - image.now().y,
            },
            axis: null,
          };
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
    } else if (now?.as === 'swipe') {
      const dx = now.finger.x.get() - now.at.x;
      const dy = now.finger.y.get() - now.at.y;
      if (now.axis === null && Math.hypot(dx, dy) >= TAP_PX)
        now.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (now.axis === 'x') image.slid(dx);
      else if (now.axis === 'y') image.swiped(dy);
    }
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
      image.wake();
      // 1. A swipe sideways, far or fast enough: the image before or after.
      if (was?.as === 'swipe' && was.axis === 'x' && all.length === 1) {
        const moved = only.dx.get();
        const speed = only.dx.getVelocity();
        preventClick();
        if (
          Math.abs(moved) >= SWIPE_DISMISS.distance ||
          Math.abs(speed) >= SWIPE_DISMISS.velocity
        )
          return image.step(moved < 0 ? 1 : -1);
        return image.settle();
      }
      // 2. A swipe down, or up, far or fast enough: away.
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
      // 3. A tap, the second of two close together: zoom in there, or out.
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
