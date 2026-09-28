import { useTap } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useState } from 'react';
import { InfiniteGrid } from './grid.tsx';
import { SwipePad } from './swipe-pad.tsx';

/**
 * The hooks reading the one Gesture Zone around the lab. With no Hold, a
 * Gesture anywhere drives both halves; under the left Hold only the grid,
 * under the right only the pad. A Tap under the left Hold resets both.
 */
export function ZoneDemo() {
  const [resets, setResets] = useState(0);
  useTap({ hold: 'left', onTap: () => setResets((count) => count + 1) });
  return (
    <div className="flex h-full flex-col">
      <InfiniteGrid reset={resets} />
      <SwipePad reset={resets} />
    </div>
  );
}
