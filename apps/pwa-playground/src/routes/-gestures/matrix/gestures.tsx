import {
  usePan,
  usePinch,
  useSwipe,
  useTap,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import {
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { useRef } from 'react';

/** A column of the matrix: the Hold every cell in it registers. */
export type Hold = 'none' | 'left' | 'right';

/**
 * What a cell hears from its gesture: `onStart` as one begins (never for a
 * tap), `onHit` when it is recognised, with what it saw, and `onCancel` when
 * a Swipe is let go before it commits.
 */
type Cell = {
  readonly hold: Hold;
  readonly onStart: () => void;
  readonly onHit: (detail: string) => void;
  readonly onCancel: () => void;
};

const px = (value: number) => Math.round(value).toString();

/** A tap of one or two fingers, as they lift. */
export function useTapCell(cell: Cell & { readonly fingers: 1 | 2 }) {
  useTap({
    fingers: cell.fingers,
    hold: cell.hold,
    onTap: ({ point }) => cell.onHit(`${px(point.x)}, ${px(point.y)}`),
  });
}

/** A Pan of one or two fingers; the live value is its offset, from 0 each time. */
export function usePanCell(
  cell: Cell & { readonly fingers: 1 | 2 },
): MotionValue<string> {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  usePan({
    fingers: cell.fingers,
    hold: cell.hold,
    x,
    y,
    momentum: false,
    onStart: () => {
      x.jump(0);
      y.jump(0);
      cell.onStart();
    },
    onEnd: ({ offset }) => cell.onHit(`${px(offset.x)}, ${px(offset.y)}`),
  });
  return useTransform(() => `${px(x.get())}, ${px(y.get())}`);
}

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

/** A Swipe in all four directions; the live value is the one moving most, and how far. */
export function useSwipeCell(
  cell: Cell & { readonly fingers: 1 | 2 },
): MotionValue<string> {
  const options = {
    fingers: cell.fingers,
    hold: cell.hold,
    distance: 120,
    onCancel: cell.onCancel,
  };
  const progress = [
    useSwipe({ ...options, direction: 'up', onSwipe: () => cell.onHit('up') }),
    useSwipe({
      ...options,
      direction: 'down',
      onSwipe: () => cell.onHit('down'),
    }),
    useSwipe({
      ...options,
      direction: 'left',
      onSwipe: () => cell.onHit('left'),
    }),
    useSwipe({
      ...options,
      direction: 'right',
      onSwipe: () => cell.onHit('right'),
    }),
  ].map((swipe) => swipe.progress);
  const most = useTransform(() =>
    Math.max(...progress.map((value) => value.get())),
  );
  // Started as progress leaves 0; over once every Swipe is home again, so
  // the spring back after a commit does not start it twice.
  const moving = useRef(false);
  useMotionValueEvent(most, 'change', (value) => {
    if (value > 0 && !moving.current) {
      moving.current = true;
      cell.onStart();
    } else if (value <= 0) {
      moving.current = false;
    }
  });
  return useTransform(() => {
    const values = progress.map((value) => value.get());
    const most = Math.max(...values);
    const index = values.indexOf(most);
    return most <= 0 ? '·' : `${DIRECTIONS[index]} ${Math.round(most * 100)}%`;
  });
}

/** A Pinch; the live value is its scale, from 1 each time, springing back past 0.25 or 4. */
export function usePinchCell(cell: Cell): MotionValue<string> {
  const scale = useMotionValue(1);
  usePinch({
    hold: cell.hold,
    scale,
    min: 0.25,
    max: 4,
    onStart: () => {
      scale.jump(1);
      cell.onStart();
    },
    onEnd: ({ scale: end }) => cell.onHit(`×${end.toFixed(2)}`),
  });
  return useTransform(() => `×${scale.get().toFixed(2)}`);
}
