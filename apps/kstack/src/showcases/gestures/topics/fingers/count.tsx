import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { useMotionValueEvent } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/**
 * How many fingers the Gesture has had, in the order they landed. A lifted
 * finger stays, faded, until the last one lifts.
 */
export function Count() {
  const { pointers } = useGesture({ directions: 'all' });
  const [list, setList] = useState<ReadonlyArray<Pointer>>([]);
  useMotionValueEvent(pointers, 'change', (map) => setList([...map.values()]));
  const down = list.filter((pointer) => pointer.end === undefined).length;
  useStageStatus(
    list.length > 0 ? `${list.length} landed · ${down} down` : undefined,
  );

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <span className="text-6xl font-semibold tabular-nums">{list.length}</span>
      <ol className="flex h-8 gap-2">
        {list.map((pointer, index) => (
          <li
            key={pointer.id}
            data-lifted={pointer.end !== undefined || undefined}
            className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity data-lifted:opacity-30"
          >
            {index + 1}
          </li>
        ))}
      </ol>
    </div>
  );
}
