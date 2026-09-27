import {
  type GestureSpring,
  useSwipe,
  useTap,
} from 'kui-toolkit/components/blocks/gestures';
import { useTransform } from 'kui-toolkit/motion';

/** How far the feed is pulled for a refresh: progress 1. */
export const PULL_PX = 72;
/** How far a row slides to show its actions: progress 1. */
export const ACTIONS_PX = 144;

/**
 * Pull to refresh on the feed's own zone: a Swipe down, which the engine
 * gives the app only while the feed is scrolled to the top. `onRefresh`'s
 * promise holds it open; then it springs home.
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  spring?: GestureSpring,
) {
  const pull = useSwipe({
    direction: 'down',
    distance: PULL_PX,
    after: 'return',
    onSwipe: onRefresh,
    spring,
  });
  const { progress, armed } = pull;
  return {
    // The list follows the finger, past 1 as well, with the rubber band.
    listY: useTransform(progress, (value) => value * PULL_PX),
    arrowRotate: useTransform(progress, [0, 1], [0, 180]),
    indicatorOpacity: useTransform(progress, [0, 0.4, 1], [0, 0.6, 1]),
    indicatorScale: useTransform(progress, [0, 1], [0.6, 1]),
    // "Pull to refresh" fades into "Release to refresh" once it would commit.
    pullLabel: useTransform(armed, [0, 1], [1, 0]),
    releaseLabel: armed,
  };
}

/**
 * One row, in a zone of its own: a Swipe left slides it open and it stays
 * open until a Swipe right closes it. A Swipe right on a closed row is not
 * this row's, so it passes out to the zones around it.
 */
export function useRowSwipe(
  row: {
    readonly onOpen: () => void;
    readonly onTap: (open: boolean) => void;
  },
  spring?: GestureSpring,
) {
  const swipe = useSwipe({
    direction: 'left',
    distance: ACTIONS_PX,
    after: 'stay',
    onSwipe: row.onOpen,
    spring,
  });
  useTap({ onTap: () => row.onTap(swipe.progress.get() > 0.5) });
  return {
    ...swipe,
    x: useTransform(swipe.progress, (value) => -value * ACTIONS_PX),
    actionsOpacity: useTransform(swipe.progress, [0, 0.5], [0, 1]),
  };
}
