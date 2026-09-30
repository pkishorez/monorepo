import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { motion, useMotionValueEvent } from 'motion/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A dot under every finger of the Gesture its zone hears, numbered in the
 * order they landed. A lifted finger's dot fades where it lifted and stays
 * until the Gesture ends, as its Pointer does. Drawn over the document, so a
 * moving page can't carry the dots off the fingers.
 */
export function Fingers() {
  const { pointers } = useGesture({});
  const [list, setList] = useState<ReadonlyArray<Pointer>>([]);
  useMotionValueEvent(pointers, 'change', (map) => setList([...map.values()]));
  if (list.length === 0) return null;
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-900">
      {list.map((pointer, index) => (
        <motion.span
          key={pointer.id}
          className="absolute top-0 left-0 -mt-6 -ml-6 grid size-12 place-items-center rounded-full bg-primary/25 text-xs font-semibold text-primary ring-2 ring-primary/60 transition-opacity duration-200"
          style={{
            x: pointer.x,
            y: pointer.y,
            opacity: pointer.end === undefined ? 1 : 0.3,
          }}
        >
          {index + 1}
        </motion.span>
      ))}
    </div>,
    document.body,
  );
}
