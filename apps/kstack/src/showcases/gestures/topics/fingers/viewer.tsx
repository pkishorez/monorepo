import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { motion, useMotionValueEvent, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/** One finger: its id, and how far it has moved, live. */
function Row(props: { readonly pointer: Pointer }) {
  const { pointer } = props;
  const dx = useTransform(pointer.dx, Math.round);
  const dy = useTransform(pointer.dy, Math.round);
  const lifted = pointer.end !== undefined;
  return (
    <li
      data-lifted={lifted || undefined}
      className="grid grid-cols-[4rem_1fr_1fr_4rem] gap-2 px-4 py-2 font-mono text-xs tabular-nums data-lifted:text-muted-foreground"
    >
      <span>#{pointer.id}</span>
      <span>
        dx <motion.span>{dx}</motion.span>
      </span>
      <span>
        dy <motion.span>{dy}</motion.span>
      </span>
      <span>{lifted ? 'lifted' : 'down'}</span>
    </li>
  );
}

/** Every finger of the Gesture, listed live; a lifted one stays, marked. */
export function Viewer() {
  const { pointers } = useGesture();
  const [list, setList] = useState<ReadonlyArray<Pointer>>([]);
  useMotionValueEvent(pointers, 'change', (map) => setList([...map.values()]));
  const down = list.filter((pointer) => pointer.end === undefined).length;
  useStageStatus(
    list.length > 0 ? `${down} down · ${list.length - down} lifted` : undefined,
  );

  return (
    <ul className="absolute inset-0 flex flex-col divide-y divide-border overflow-hidden">
      {list.length === 0 ? (
        <li className="px-4 py-2 font-mono text-xs text-muted-foreground">
          No fingers
        </li>
      ) : (
        list.map((pointer) => <Row key={pointer.id} pointer={pointer} />)
      )}
    </ul>
  );
}
