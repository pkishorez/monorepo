import { useGesture } from '@kstackz/use-gesture/core';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/**
 * How the last Gesture ended. One the browser took, by scrolling the list
 * or because the page lost focus, ends Interrupted.
 */
export function Interrupted() {
  const [ended, setEnded] = useState<'Ended' | 'Interrupted'>();
  const { active } = useGesture({
    onStart: () => setEnded(undefined),
    onEnd: (_pointers, end) =>
      setEnded(end.interrupted ? 'Interrupted' : 'Ended'),
  });
  useStageStatus(active ? 'Under way' : ended);

  return (
    <div className="absolute inset-0 flex flex-col">
      <p
        data-interrupted={ended === 'Interrupted' || undefined}
        className="border-b border-border px-4 py-3 text-sm font-medium data-interrupted:text-destructive"
      >
        {active ? 'Under way' : (ended ?? 'Waiting')}
      </p>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {Array.from({ length: 40 }, (_, i) => (
          <li key={i} className="px-4 py-3 text-sm">
            Row {i + 1}
          </li>
        ))}
      </ul>
    </div>
  );
}
