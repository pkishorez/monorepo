import {
  type SharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** How far the page moves aside for the Sidebar, in points: the web's 18rem. */
const WIDTH = 288;

/** The Sidebar's width on a screen `screen` points wide: never more than 80 % of it. */
export const widthOn = (screen: number) => Math.min(WIDTH, screen * 0.8);

// The web's phone spring: 0.3 s, no bounce. Reanimated's `duration` is the
// perceived one, as Motion's `visualDuration`.
const SPRING = { duration: 300, dampingRatio: 1 } as const;

/**
 * A drag this far, in points, or this fast, in points a second, opens it or
 * shuts it: Swipe's DEFAULT_COMMIT, as the edge swipe.
 */
const COMMIT = { distance: 80, velocity: 500 } as const;

/** Whether a drag open let go `offset` points right, moving `velocity`, opens it. */
export const opens = (offset: number, velocity: number) => {
  'worklet';
  return offset >= COMMIT.distance || velocity >= COMMIT.velocity;
};

/**
 * How open the Sidebar is, 0 shut to 1 open, shared by the page that moves
 * aside and the Sidebar under it; a finger sets it directly.
 */
export type Progress = SharedValue<number>;

/**
 * Carries `progress` to `to`, with the finger's `velocity` (in widths a
 * second) so a fling keeps going, or at once for reduced motion.
 */
export const settle = (
  progress: Progress,
  to: 0 | 1,
  velocity: number,
  still: boolean,
) => {
  'worklet';
  progress.value = still
    ? withTiming(to, { duration: 0 })
    : withSpring(to, { ...SPRING, velocity });
};

/**
 * Whether a drag back let go at `progress`, moving `velocity` points a
 * second (negative toward shut), on a Sidebar `width` wide, shuts it.
 */
export const shuts = (progress: number, velocity: number, width: number) => {
  'worklet';
  return opens((1 - progress) * width, -velocity);
};

/** Where `offset` points of finger puts `progress`, on a Sidebar `width` wide. */
export const along = (offset: number, width: number) => {
  'worklet';
  return Math.min(1, Math.max(0, offset / width));
};
