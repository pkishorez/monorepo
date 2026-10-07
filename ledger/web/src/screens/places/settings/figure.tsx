import { cn } from '@kstackz/web-toolkit/components/utils';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import type { Motion, Way } from '@ledger/core/app/commands';

// How far, in px, the finger travels in a figure.
const TRAVEL = 14;

const STEP: Readonly<Record<Way, { readonly x: number; readonly y: number }>> =
  {
    up: { x: 0, y: -TRAVEL },
    down: { x: 0, y: TRAVEL },
    left: { x: -TRAVEL, y: 0 },
    right: { x: TRAVEL, y: 0 },
  };

const EASE = [0.23, 1, 0.32, 1] as const;

// Rest, move, hold, fade, and come back unseen to where it started.
const BACK = [0, 0.15, 0.6, 0.75, 0.8, 1];

/**
 * A gesture, drawn small: fingers as dots on a screen. It plays once when
 * it comes into view, and again on hover or a tap, and stands still for
 * those who ask for less motion. A Thumb Lock shows the resting thumb at
 * the left, ringed, and the finger that swipes.
 */
export function GestureFigure(props: {
  readonly motion: Motion;
  readonly className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box, { once: true, amount: 0.6 });
  const still = useReducedMotion() === true;
  const [plays, setPlays] = useState(0);
  const play = () => setPlays((n) => n + 1);
  const playing = seen && !still;
  const { motion: gesture } = props;

  return (
    <div
      ref={box}
      aria-hidden="true"
      onPointerEnter={play}
      onClick={play}
      className={cn(
        'relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted/50',
        props.className,
      )}
    >
      {gesture.kind === 'thumb' && (
        <span className="absolute bottom-2 left-2 size-3 rounded-full bg-foreground/30 ring-4 ring-foreground/10" />
      )}
      {gesture.kind === 'drag' && (
        <motion.span
          key={`sheet-${plays}`}
          className="absolute inset-x-1.5 top-4 bottom-0 rounded-t-md border border-b-0 bg-background"
          initial={{ y: 0 }}
          animate={
            playing
              ? { y: [0, 0, 22, 22, 0, 0], opacity: [1, 1, 1, 0, 0, 1] }
              : {}
          }
          transition={{ duration: 1.3, times: BACK, ease: EASE }}
        />
      )}
      <Finger key={plays} motion={gesture} playing={playing} />
    </div>
  );
}

function Finger(props: { readonly motion: Motion; readonly playing: boolean }) {
  const { motion: gesture, playing } = props;
  // Where the finger lands: the middle, or nearer the thumb's other side.
  const at =
    gesture.kind === 'thumb'
      ? 'left-[26px] top-[18px]'
      : gesture.kind === 'drag'
        ? 'left-[18px] top-[14px]'
        : 'left-[18px] top-[18px]';
  if (gesture.kind === 'tap') {
    return (
      <motion.span
        className={cn('absolute size-3 rounded-full bg-foreground/70', at)}
        initial={{ scale: 1, opacity: 1 }}
        animate={
          playing ? { scale: [1, 0.6, 1.4, 1], opacity: [1, 1, 0.4, 1] } : {}
        }
        transition={{ duration: 0.7, ease: EASE }}
      />
    );
  }
  const step = STEP[gesture.way];
  const reach = gesture.kind === 'drag' ? 1.6 : 1;
  const far = { x: step.x * reach, y: step.y * reach };
  return (
    <motion.span
      className={cn('absolute size-3 rounded-full bg-foreground/70', at)}
      initial={{ x: 0, y: 0, opacity: 1 }}
      animate={
        playing
          ? {
              x: [0, 0, far.x, far.x, 0, 0],
              y: [0, 0, far.y, far.y, 0, 0],
              opacity: [1, 1, 1, 0, 0, 1],
            }
          : {}
      }
      transition={{ duration: 1.3, times: BACK, ease: EASE }}
    />
  );
}
