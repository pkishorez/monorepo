import { InfiniteGrid } from './grid.tsx';
import { SwipePad } from './swipe-pad.tsx';

/**
 * Both hooks reading the one Gesture Zone around the lab: the grid on top
 * follows every Gesture, the pad below shows every Swipe. A Gesture anywhere
 * on screen drives both.
 */
export function ZoneDemo() {
  return (
    <div className="flex h-full flex-col">
      <InfiniteGrid />
      <SwipePad />
    </div>
  );
}
