import { useMotionValueEvent } from 'motion/react';
import { GestureZone, useSwipe } from '@kestack/web-platform/ui/input';
import type { ComponentProps } from 'react';

/*
 * A Gesture Zone of its own whose sideways Swipes do what `swipes` says,
 * each way only while it says something, so the other way, and a way it
 * has nothing for, goes on to the zone around it, such as the sidebar's.
 * Up and down it wants nothing: the words scroll.
 */

/** What a sideways Swipe does here, each way; a way with none is left to what is around it. */
export type Swipes = {
  readonly left?: () => void;
  readonly right?: () => void;
};

/** A Swipe past this many px, or flicked past this many px/s, counts. */
const SWIPE = { distance: 56, velocity: 400 } as const;

export function SwipeZone({
  ref,
  swipes,
  onMove,
  onSwiped,
  children,
  ...props
}: ComponentProps<'div'> & {
  readonly swipes: Swipes;
  /** How far a Swipe has gone, in px, signed, as it goes; null once it ends. */
  readonly onMove: ((offset: number | null) => void) | undefined;
  /** A Swipe here took the Gesture. */
  readonly onSwiped: () => void;
}) {
  return (
    <GestureZone ref={ref} {...props}>
      <Swiping swipes={swipes} onMove={onMove} onSwiped={onSwiped} />
      {children}
    </GestureZone>
  );
}

function Swiping({
  swipes,
  onMove,
  onSwiped,
}: {
  readonly swipes: Swipes;
  readonly onMove: ((offset: number | null) => void) | undefined;
  readonly onSwiped: () => void;
}) {
  const way = (direction: 'left' | 'right', run: (() => void) | undefined) => ({
    enabled: run !== undefined,
    direction,
    commit: SWIPE,
    onStart: onSwiped,
    onCommit: () => {
      onMove?.(null);
      run?.();
    },
    onCancel: () => onMove?.(null),
  });
  const left = useSwipe(way('left', swipes.left));
  const right = useSwipe(way('right', swipes.right));
  useMotionValueEvent(left.offset, 'change', (offset) => {
    if (offset > 0) onMove?.(-offset);
  });
  useMotionValueEvent(right.offset, 'change', (offset) => {
    if (offset > 0) onMove?.(offset);
  });
  return null;
}
