import { useTap } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useState } from 'react';
import { InfiniteGrid } from './grid.tsx';
import { SwipePad } from './swipe-pad.tsx';

/**
 * A screen that reads two fingers: with no Hold, a Gesture anywhere drives
 * both halves, and two fingers zoom and turn the grid. Under the Hold, which
 * here takes a still press in the corner, only the pad moves, and a Tap
 * resets both.
 */
export function ZoneDemo() {
  const [resets, setResets] = useState(0);
  useTap({ hold: true, onTap: () => setResets((count) => count + 1) });
  return (
    <div className="flex h-full flex-col">
      <InfiniteGrid reset={resets} />
      <SwipePad reset={resets} />
    </div>
  );
}
