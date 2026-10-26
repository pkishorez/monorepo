// oxlint-disable-next-line no-restricted-imports -- a prototype: the dock measures its own width.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';

/*
 * The timeline's ticks as a dock: one bar per tick, all of them across the
 * width there is, never scrolled, on a shelf. The bars swell as the Mac's
 * dock does, most at one point and less further off: at rest, around the
 * tick chosen, gliding with it; while the pointer is over the dock, around
 * the pointer, naming the tick under it. Press anywhere and drag, with
 * a mouse or a finger, and the tick under the pointer is chosen as it
 * moves; the arrow keys, Home and End step through them too.
 */

export interface DockTick {
  readonly id: string;
  readonly label: string;
  /** The bar's shade, a background class. */
  readonly shade: string;
}

/** Where the swell starts, before the dock is measured: off its left edge. */
const AWAY = -10_000;
/** How far, at least, in pixels, the dock's swell reaches either side of the pointer; further when the bars stand further apart. */
const REACH = 36;
const REST = { bar: 10, chosen: 22 } as const;
const SWELL = 34;

function Bar({
  center,
  reach,
  pointer,
  chosen,
  shade,
  width,
}: {
  readonly center: number;
  readonly reach: number;
  readonly pointer: MotionValue<number>;
  readonly chosen: boolean;
  readonly shade: string;
  readonly width: number;
}) {
  const rest = chosen ? REST.chosen : REST.bar;
  const height = useTransform(pointer, (at) => {
    const near = Math.exp(-((at - center) ** 2) / (2 * reach ** 2));
    return rest + (SWELL - rest) * near;
  });
  return (
    <motion.span
      aria-hidden
      className={cn(
        'absolute bottom-1 -translate-x-1/2 rounded-full transition-[opacity,background-color] duration-150 motion-reduce:transition-none',
        shade,
        chosen ? 'bg-foreground opacity-100' : 'opacity-55',
      )}
      style={{ left: center, width, height }}
    />
  );
}

export function Dock({
  ticks,
  index,
  onPick,
}: {
  readonly ticks: ReadonlyArray<DockTick>;
  /** The tick chosen. */
  readonly index: number;
  readonly onPick: (index: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState<number | null>(null);
  /** Hovered or held: the dock rises. */
  const [hot, setHot] = useState(false);
  const dragging = useRef(false);
  const reduced = useReducedMotion() ?? false;
  const raw = useMotionValue(AWAY);
  const smooth = useSpring(raw, { stiffness: 500, damping: 40 });
  const pointer = reduced ? raw : smooth;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry?.contentRect.width ?? 0),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const count = ticks.length;
  const slot = count > 0 ? width / count : 0;
  const barWidth = Math.max(1.5, Math.min(6, slot * 0.6));
  const last = count - 1;

  /** The tick under a point of the screen, and where that is in the dock. */
  const at = (clientX: number) => {
    const left = box.current?.getBoundingClientRect().left ?? 0;
    const x = clientX - left;
    return {
      x,
      tick: Math.max(0, Math.min(last, Math.floor(x / Math.max(1, slot)))),
    };
  };
  const follow = (event: PointerEvent) => {
    const { x, tick } = at(event.clientX);
    raw.set(x);
    setNear(tick);
    return tick;
  };
  // At rest the swell sits on the tick chosen, and glides with it; the
  // pointer takes it while it is over the dock, and gives it back on leaving.
  const home = (index + 0.5) * slot;
  useEffect(() => {
    if (!hot && slot > 0) raw.set(home);
  }, [hot, home, slot, raw]);
  const leave = () => {
    raw.set(home);
    setNear(null);
    setHot(false);
  };

  const onKey = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    const to =
      step !== undefined
        ? index + step
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : undefined;
    if (to === undefined) return;
    event.preventDefault();
    onPick(Math.max(0, Math.min(last, to)));
  };

  const shown = near ?? (dragging.current ? index : null);
  const label = shown !== null ? ticks[shown] : undefined;
  return (
    <div className="px-3 pt-2">
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Steps"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, count)}
        aria-valuenow={index + 1}
        aria-valuetext={
          ticks[index] ? `${index + 1}: ${ticks[index].label}` : undefined
        }
        onKeyDown={onKey}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return;
          setHot(true);
          follow(event);
        }}
        onPointerMove={(event) => {
          const tick = follow(event);
          if (dragging.current && tick !== index) onPick(tick);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          setHot(true);
          onPick(follow(event));
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          if (event.pointerType !== 'mouse') leave();
        }}
        onPointerCancel={() => {
          dragging.current = false;
          leave();
        }}
        onPointerLeave={() => {
          if (!dragging.current) leave();
        }}
        className="relative h-11 cursor-pointer touch-none rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The dock's shelf: faint at rest, rising while hovered or held. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-xl border transition-[background-color,border-color] duration-200 ease-out motion-reduce:transition-none',
            hot ? 'border-border bg-muted/60' : 'border-border/60 bg-muted/35',
          )}
        />
        {ticks.map((tick, i) => (
          <Bar
            key={tick.id}
            center={(i + 0.5) * slot}
            reach={Math.max(REACH, slot * 1.1)}
            pointer={pointer}
            chosen={i === index}
            shade={tick.shade}
            width={barWidth}
          />
        ))}
        {/* The tick under the pointer, named over it. */}
        {label && shown !== null && (
          <span
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 font-mono text-[11px] whitespace-nowrap text-popover-foreground shadow-md"
            style={{
              left: Math.max(60, Math.min(width - 60, (shown + 0.5) * slot)),
            }}
          >
            <span className="text-muted-foreground tabular-nums">
              {shown + 1}
            </span>{' '}
            {label.label}
          </span>
        )}
      </div>
    </div>
  );
}
