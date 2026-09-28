import {
  type Axis,
  type SwipeEnd,
  useHold,
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

const PUCK = 40;

const HOME = { type: 'spring', stiffness: 400, damping: 30 } as const;

// Follows the finger closely near the middle and never leaves the pad.
const soft = (distance: number, reach: number) =>
  reach <= 0 ? 0 : reach * Math.tanh(distance / reach);

const describe = (end: SwipeEnd) =>
  `${end.axis} · ${Math.round(end.distance)}px · ${Math.round(end.velocity)}px/s${end.interrupted ? ' · interrupted' : ''}`;

/**
 * A still grid showing every Swipe with no Hold or under the right Hold: the
 * puck follows the finger along the Swipe's axis and stays where the Swipe
 * leaves it, adding each Swipe to the last; an interrupted one springs back. `reset` changing springs it back
 * to the middle. Under the left Hold it rests.
 */
export function SwipePad(props: { readonly reset: number }) {
  const hold = useHold();
  const pad = useRef<HTMLDivElement>(null);
  const distance = useRef<HTMLSpanElement>(null);
  const reach = useRef({ x: 0, y: 0 });
  // Every finished Swipe added up, before softening to the pad.
  const travelled = useRef({ x: 0, y: 0 });
  const puckX = useMotionValue(0);
  const puckY = useMotionValue(0);
  const [last, setLast] = useState<SwipeEnd | undefined>(undefined);

  // An interrupted Swipe is dropped: the puck springs back to where it was.
  const onEnd = (end: SwipeEnd) => {
    setLast(end);
    if (!end.interrupted) {
      travelled.current[end.axis] += end.distance;
      return;
    }
    const puck = end.axis === 'x' ? puckX : puckY;
    const back = soft(travelled.current[end.axis], reach.current[end.axis]);
    void animate(puck, back, { ...HOME, velocity: end.velocity });
  };
  const plain = useSwipe({ onEnd });
  const right = useSwipe({ hold: 'right', onEnd });
  const swipe = right.active ? right : plain;

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

  useEffect(() => {
    if (props.reset === 0) return;
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
  useMotionValueEvent(right.dx, 'change', follow('x'));
  useMotionValueEvent(right.dy, 'change', follow('y'));

  return (
    <section
      data-testid="swipe-section"
      data-resting={hold === 'left' ? '' : undefined}
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 p-3 transition-[opacity,filter] duration-200',
        hold === 'left' && 'opacity-35 grayscale',
      )}
    >
      <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">useSwipe · no Hold, right</span>
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
        Hold a bottom corner to steer one half. Hold left and tap to reset.
      </p>
    </section>
  );
}
