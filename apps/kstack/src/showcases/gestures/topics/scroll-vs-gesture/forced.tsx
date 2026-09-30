import { useGesture, type Pointer } from '@kstackz/use-gesture/core';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/**
 * A list with a band marked `data-zone-gesture="enabled"`. A drag on the
 * band never scrolls: the zone takes it, and the dot follows the finger.
 */
export function Forced() {
  const [scrolling, setScrolling] = useState(false);
  const [finger, setFinger] = useState<Pointer>();
  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      if (first?.target?.closest('[data-zone-gesture="enabled"]')) {
        setFinger(first);
      }
    },
    onEnd: () => setFinger(undefined),
  });
  useStageStatus(
    finger !== undefined
      ? 'The zone has it'
      : scrolling
        ? 'The list has it'
        : undefined,
  );

  const rows = (from: number) =>
    Array.from({ length: 12 }, (_, i) => (
      <li key={i} className="px-4 py-3 text-sm">
        Row {from + i}
      </li>
    ));

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      onScroll={() => setScrolling(true)}
      onScrollEnd={() => setScrolling(false)}
    >
      <ul className="flex flex-col divide-y divide-border">{rows(1)}</ul>
      <div
        data-zone-gesture="enabled"
        className="relative grid h-32 place-items-center overflow-hidden border-y border-dashed border-primary/40 bg-primary/5"
      >
        <motion.span
          className="size-6 rounded-full bg-primary"
          style={{ x: finger?.dx ?? 0, y: finger?.dy ?? 0 }}
        />
      </div>
      <ul className="flex flex-col divide-y divide-border">{rows(13)}</ul>
    </div>
  );
}
