import {
  usePan,
  usePinch,
  useSwipe,
  useTap,
} from 'kui-toolkit/components/blocks/gestures';
import {
  type MotionValue,
  useMotionValue,
  useTransform,
} from 'kui-toolkit/motion';

/** A column of the matrix: the Hold every cell in it registers. */
export type Hold = 'none' | 'left' | 'right';

/** What a cell does when its gesture is recognised: count, and say what it saw. */
type Hit = (detail: string) => void;

type Cell = { readonly hold: Hold; readonly onHit: Hit };

const px = (value: number) => Math.round(value).toString();

/** A tap or double tap of one or two fingers. Double taps make single taps wait. */
export function useTapCell(
  cell: Cell & { readonly count: 1 | 2; readonly fingers: 1 | 2 },
) {
  useTap({
    count: cell.count,
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
  const options = { fingers: cell.fingers, hold: cell.hold, distance: 120 };
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
    onStart: () => scale.jump(1),
    onEnd: ({ scale: end }) => cell.onHit(`×${end.toFixed(2)}`),
  });
  return useTransform(() => `×${scale.get().toFixed(2)}`);
}
