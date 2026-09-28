import {
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
import { useLayoutEffect, useRef, useState } from 'react';

const PUCK = 40;

// Follows the finger closely near the middle and never leaves the pad.
const soft = (distance: number, reach: number) =>
  reach <= 0 ? 0 : reach * Math.tanh(distance / reach);

const describe = (end: SwipeEnd) =>
  `${end.axis} · ${Math.round(end.distance)}px · ${Math.round(end.velocity)}px/s${end.interrupted ? ' · interrupted' : ''}`;

/**
 * A still grid showing every Swipe in the zone: the puck follows the finger
 * along the Swipe's axis, the live distance reads beside it, and on release
 * it springs home carrying the Swipe's speed.
 */
export function SwipePad() {
  const pad = useRef<HTMLDivElement>(null);
  const distance = useRef<HTMLSpanElement>(null);
  const reach = useRef({ x: 0, y: 0 });
  const puckX = useMotionValue(0);
  const puckY = useMotionValue(0);
  const [last, setLast] = useState<SwipeEnd | undefined>(undefined);

  const swipe = useSwipe({
    onEnd: (end) => {
      setLast(end);
      const puck = end.axis === 'x' ? puckX : puckY;
      void animate(puck, 0, {
        type: 'spring',
        stiffness: 500,
        damping: 30,
        velocity: end.velocity,
      });
    },
  });

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

  // dx and dy only change during a Swipe, and start again from 0 with each.
  const follow = (axis: 'x' | 'y') => (value: number) => {
    const puck = axis === 'x' ? puckX : puckY;
    puck.stop();
    puck.set(soft(value, reach.current[axis]));
    if (distance.current !== null) {
      distance.current.textContent = `${value > 0 ? '+' : ''}${Math.round(value)}px`;
    }
  };
  useMotionValueEvent(swipe.dx, 'change', follow('x'));
  useMotionValueEvent(swipe.dy, 'change', follow('y'));

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">useSwipe</span>
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
    </section>
  );
}
