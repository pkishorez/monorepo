import {
  type Axis,
  type SwipeEnd,
  useSwipe,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Coast, cap, glide } from './glide.ts';

const PUCK = 40;

const HOME = { type: 'spring', stiffness: 400, damping: 30 } as const;

// The fastest a released puck carries on, in px per second.
const MAX_SPEED = 5000;

// How far past the pad's reach the puck's travel may go: softened, it is
// then all but at the edge.
const EDGE = 3;

// Follows the finger closely near the middle and never leaves the pad.
const soft = (distance: number, reach: number) =>
  reach <= 0 ? 0 : reach * Math.tanh(distance / reach);

const describe = (end: SwipeEnd) =>
  `${end.axis} · ${Math.round(end.distance)}px · ${Math.round(end.velocity)}px/s${end.interrupted ? ' · interrupted' : ''}`;

/**
 * A still grid showing every Swipe, with no Hold or under it: the
 * puck follows the finger along the Swipe's axis and stays where the Swipe
 * leaves it, adding each Swipe to the last. On release it glides on at the
 * Swipe's speed, slowing to a stop; an interrupted one springs back. Its
 * position reads live above it. `reset` changing springs it back to the
 * middle.
 */
export function SwipePad(props: { readonly reset: number }) {
  const pad = useRef<HTMLDivElement>(null);
  const distance = useRef<HTMLSpanElement>(null);
  const position = useRef<HTMLSpanElement>(null);
  const coasting = useRef<Coast | undefined>(undefined);
  const reach = useRef({ x: 0, y: 0 });
  // Every finished Swipe added up, before softening to the pad.
  const travelled = useRef({ x: 0, y: 0 });
  const puckX = useMotionValue(0);
  const puckY = useMotionValue(0);
  const [last, setLast] = useState<SwipeEnd | undefined>(undefined);

  // A finished Swipe glides on until it slows to a stop or reaches the
  // edge. An interrupted one is dropped: the puck springs back.
  const onEnd = (end: SwipeEnd) => {
    setLast(end);
    const { axis } = end;
    const puck = axis === 'x' ? puckX : puckY;
    const limit = EDGE * reach.current[axis];
    if (end.interrupted) {
      const back = soft(travelled.current[axis], reach.current[axis]);
      void animate(puck, back, { ...HOME, velocity: end.velocity });
      return;
    }
    const along = (moved: number) =>
      Math.max(-limit, Math.min(limit, travelled.current[axis] + moved));
    travelled.current[axis] = along(end.distance);
    coasting.current?.stop();
    coasting.current = glide([cap(end.velocity, MAX_SPEED)], ([moved = 0]) => {
      const next = along(moved);
      travelled.current[axis] = next;
      puck.set(soft(next, reach.current[axis]));
      return Math.abs(next) < limit;
    });
  };
  const plain = useSwipe({ onEnd });
  const held = useSwipe({ hold: true, onEnd });
  const swipe = held.active ? held : plain;

  useLayoutEffect(() => {
    const node = pad.current;
    if (node === null) return;
    const measure = () => {
      reach.current = {
        x: node.clientWidth / 2 - PUCK,
        y: node.clientHeight / 2 - PUCK,
      };
    };
    measure();
    const resizes = new ResizeObserver(measure);
    resizes.observe(node);
    return () => resizes.disconnect();
  }, []);

  // A Swipe starting catches the puck mid-glide.
  const swiping = plain.active || held.active;
  useLayoutEffect(() => {
    if (swiping) coasting.current?.stop();
  }, [swiping]);

  useEffect(() => {
    if (props.reset === 0) return;
    coasting.current?.stop();
    travelled.current = { x: 0, y: 0 };
    setLast(undefined);
    const controls = [animate(puckX, 0, HOME), animate(puckY, 0, HOME)];
    return () => {
      for (const control of controls) control.stop();
    };
  }, [props.reset, puckX, puckY]);

  // dx and dy only change during a Swipe, and start again from 0 with each.
  const follow = (axis: Axis) => (value: number) => {
    const puck = axis === 'x' ? puckX : puckY;
    puck.stop();
    puck.set(soft(travelled.current[axis] + value, reach.current[axis]));
    if (distance.current !== null) {
      distance.current.textContent = `${value > 0 ? '+' : ''}${Math.round(value)}px`;
    }
  };
  useMotionValueEvent(plain.dx, 'change', follow('x'));
  useMotionValueEvent(plain.dy, 'change', follow('y'));
  useMotionValueEvent(held.dx, 'change', follow('x'));
  useMotionValueEvent(held.dy, 'change', follow('y'));

  // Where the puck is from the middle, as it moves, glides and springs.
  const show = () => {
    if (position.current === null) return;
    position.current.textContent = `x ${Math.round(puckX.get())} · y ${Math.round(puckY.get())}`;
  };
  useMotionValueEvent(puckX, 'change', show);
  useMotionValueEvent(puckY, 'change', show);

  return (
    <section
      data-testid="swipe-section"
      className="flex min-h-0 flex-1 flex-col gap-2 p-3"
    >
      <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">useSwipe · no Hold and Hold</span>
        <span className="font-mono tabular-nums" data-testid="swipe-last">
          {last === undefined ? 'no swipe yet' : describe(last)}
        </span>
      </p>
      <div
        ref={pad}
        data-testid="swipe-pad"
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
        style={{
          backgroundSize: '24px 24px',
          backgroundPosition: 'center',
          backgroundImage:
            'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        }}
      >
        <span
          ref={position}
          data-testid="swipe-position"
          className="absolute top-2 left-2 rounded bg-background/80 px-1.5 font-mono text-xs tabular-nums"
        >
          x 0 · y 0
        </span>
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary transition-opacity',
            swipe.active && swipe.axis === 'x' ? 'opacity-60' : 'opacity-0',
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary transition-opacity',
            swipe.active && swipe.axis === 'y' ? 'opacity-60' : 'opacity-0',
          )}
        />
        <motion.div
          data-testid="swipe-puck"
          style={{ x: puckX, y: puckY, width: PUCK, height: PUCK }}
          className={cn(
            'absolute top-1/2 left-1/2 -mt-5 -ml-5 rounded-full border-2 border-primary bg-background shadow-sm',
            swipe.active && 'bg-primary',
          )}
        />
        <span
          ref={distance}
          className={cn(
            'absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-background/80 px-1.5 font-mono text-xs tabular-nums transition-opacity',
            swipe.active ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Press the bottom-left corner until the ring fills: then only the pad
        moves, and a tap resets both.
      </p>
    </section>
  );
}
