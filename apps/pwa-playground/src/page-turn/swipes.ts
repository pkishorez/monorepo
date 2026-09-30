import { useGesture } from '@kstackz/use-gesture/core';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Side } from './geometry.ts';

// Letting go past this far, or this fast, finishes the move under way.
const COMMIT = { distance: 110, velocity: 600 } as const;

type Handlers = {
  /** Read as a finger lands: whether a Swipe that moves toward `side` may start. */
  readonly can: (side: Side) => boolean;
  /** The Swipe is Tracking; answers whether the turn takes it. */
  readonly onStart: (side: Side) => boolean;
  readonly onMove: (side: Side, offset: number) => void;
  readonly onWillTurn: (will: boolean) => void;
  /** The finger lifted, or the browser took the touch; `velocity` in px/s toward `side`. */
  readonly onEnd: (side: Side, finished: boolean, velocity: number) => void;
};

const useLatest = <T>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

/**
 * Two Swipes, one each way: a finger moving left moves toward the next page,
 * right toward the previous one. Only the one the turn takes is followed. A
 * Swipe that starts in `edge` px of the left side is the menu's, never a turn.
 */
export function useTurnSwipes(
  options: { readonly enabled: boolean; readonly edge: number } & Handlers,
) {
  const latest = useLatest(options);
  const active = useRef<Side | undefined>(undefined);
  const fromEdge = useRef(false);

  useGesture({
    enabled: options.enabled,
    onStart: (pointers) => {
      const [first] = pointers.values();
      fromEdge.current =
        first !== undefined && first.start.x <= latest.current.edge;
    },
  });

  const swipe = (side: Side) => ({
    direction: side === 'next' ? ('left' as const) : ('right' as const),
    enabled: options.enabled && options.can(side),
    commit: COMMIT,
    onStart: () => {
      if (fromEdge.current || !latest.current.onStart(side)) return;
      active.current = side;
    },
    onCommit: (release: { readonly velocity: number }) => {
      if (active.current !== side) return;
      active.current = undefined;
      latest.current.onEnd(side, true, release.velocity);
    },
    onCancel: (_: unknown, release?: { readonly velocity: number }) => {
      if (active.current !== side) return;
      active.current = undefined;
      latest.current.onEnd(side, false, release?.velocity ?? 0);
    },
  });

  const toNext = useSwipe(swipe('next'));
  const toPrev = useSwipe(swipe('prev'));

  useEffect(() => {
    const follow = (side: Side, recognizer: typeof toNext) => [
      recognizer.offset.on('change', (offset) => {
        if (active.current === side) latest.current.onMove(side, offset);
      }),
      recognizer.willCommit.on('change', (will) => {
        if (active.current === side) latest.current.onWillTurn(will);
      }),
    ];
    const offs = [...follow('next', toNext), ...follow('prev', toPrev)];
    return () => offs.forEach((off) => off());
    // The recognizers' motion values live as long as the component.
  }, []);
}
