import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';

/*
 * The timeline's ticks as a track to scrub: one mark per tick, never
 * scrolled, on a rail filled up to the tick chosen. Few ticks stand at
 * most `gap` apart from the left, the rail as long as they need; as more
 * come they draw closer, until they share the whole width.
 * The tick chosen stands up as a handle; each mark keeps its own shade,
 * whichever side of it it is on. Hovering names the tick under the
 * pointer, and a finger's choice is named a moment after it lifts; press
 * anywhere and drag, with a mouse or a finger, and the tick under it is
 * chosen as it moves; the arrow keys, Home and End step through them.
 * Nothing in it changes size: only colour and the handle's place move.
 */

export interface TrackTick {
  readonly id: string;
  readonly label: string;
  /** The mark's shade, a background class. */
  readonly shade: string;
}

/** How far apart, at most, in pixels, two ticks stand. */
const GAP = 48;
/** How long, in milliseconds, a Step chosen by a finger stays named. */
const LINGER = 1200;

export function Track({
  ticks,
  index,
  onPick,
  gap = GAP,
  className,
}: {
  readonly ticks: ReadonlyArray<TrackTick>;
  /** How far apart, at most, in pixels, two ticks stand. */
  readonly gap?: number;
  /** The tick chosen; -1 at init, the handle at the rail's start. */
  readonly index: number;
  readonly onPick: (index: number) => void;
  readonly className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState<number | null>(null);
  const dragging = useRef(false);
  const lingering = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(lingering.current), []);

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
  const slot = count > 0 ? Math.min(gap, width / count) : 0;
  /** As long as the ticks need, never longer than the track. */
  const span = slot * count;
  const mark = Math.max(1.5, Math.min(4, slot * 0.5));
  const last = count - 1;
  const center = (i: number) => (i < 0 ? 0 : (i + 0.5) * slot);

  /** The tick under a point of the screen. */
  const at = (clientX: number) => {
    const left = box.current?.getBoundingClientRect().left ?? 0;
    return Math.max(
      0,
      Math.min(last, Math.floor((clientX - left) / Math.max(1, slot))),
    );
  };
  const follow = (event: PointerEvent) => {
    const tick = at(event.clientX);
    setNear(tick);
    return tick;
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

  const named = near !== null ? ticks[near] : undefined;
  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Steps"
      aria-valuemin={1}
      aria-valuemax={Math.max(1, count)}
      aria-valuenow={index + 1}
      aria-valuetext={
        index < 0
          ? 'init'
          : ticks[index]
            ? `${index + 1}: ${ticks[index].label}`
            : undefined
      }
      onKeyDown={onKey}
      onPointerMove={(event) => {
        const tick = follow(event);
        if (dragging.current && tick !== index) onPick(tick);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        clearTimeout(lingering.current);
        dragging.current = true;
        onPick(follow(event));
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        // A finger has no hover: the Step it chose stays named a moment.
        if (event.pointerType !== 'mouse')
          lingering.current = setTimeout(() => setNear(null), LINGER);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        setNear(null);
      }}
      onPointerLeave={() => {
        if (!dragging.current) setNear(null);
      }}
      className={cn(
        'group relative h-10 cursor-pointer touch-none rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {/* The rail, filled up to the tick chosen. */}
      <span
        aria-hidden
        className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-muted"
        style={{ width: span }}
      />
      <span
        aria-hidden
        className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-foreground/15 transition-[width] duration-150 ease-out motion-reduce:transition-none"
        style={{ width: count > 0 ? center(index) : 0 }}
      />
      {ticks.map((tick, i) => (
        <span
          key={tick.id}
          aria-hidden
          className={cn(
            'absolute top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150 motion-reduce:transition-none',
            tick.shade,
          )}
          style={{ left: center(i), width: mark }}
        />
      ))}
      {/* The tick hovered, ringed; the tick chosen, a handle. */}
      {near !== null && near !== index && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-foreground/40"
          style={{ left: center(near) }}
        />
      )}
      {count > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-[0_0_0_2px_var(--color-background)] transition-[left] duration-150 ease-out group-active:transition-none motion-reduce:transition-none"
          style={{ left: center(index) }}
        />
      )}
      {named && near !== null && (
        <span
          className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-[11px] whitespace-nowrap text-popover-foreground shadow-md"
          style={{
            left: Math.max(80, Math.min(width - 80, center(near))),
          }}
        >
          <span className="text-muted-foreground tabular-nums">{near + 1}</span>
          <span className="font-mono">{named.label}</span>
        </span>
      )}
    </div>
  );
}
