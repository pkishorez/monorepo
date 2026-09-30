import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from 'motion/react';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.25 } as const;

const midpoint = (a: Pointer, b: Pointer) => ({
  x: (a.x.get() + b.x.get()) / 2,
  y: (a.y.get() + b.y.get()) / 2,
});

const distance = (a: Pointer, b: Pointer) =>
  Math.hypot(a.x.get() - b.x.get(), a.y.get() - b.y.get());

/**
 * A feed with a photo in it. One finger scrolls the feed, as the browser
 * does; two fingers on the photo zoom it out of its card, and letting go
 * springs it back.
 */
export function PinchInList() {
  const card = useRef<HTMLDivElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const stop = useRef<() => void>(undefined);
  const [pinching, setPinching] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [shown, setShown] = useState(1);
  useMotionValueEvent(scale, 'change', (value) =>
    setShown(Math.round(value * 10) / 10),
  );
  useStageStatus(
    pinching
      ? `Pinching · ${shown.toFixed(1)}×`
      : scrolling
        ? 'The feed has the touch'
        : undefined,
  );

  // From now on, the photo point under the fingers' midpoint stays under it.
  const follow = (a: Pointer, b: Pointer) => {
    const rect = card.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const from = { scale: scale.get(), distance: distance(a, b) };
    const mid = midpoint(a, b);
    const px = (mid.x - cx - x.get()) / from.scale;
    const py = (mid.y - cy - y.get()) / from.scale;
    const update = () => {
      const now = midpoint(a, b);
      const s = Math.max(1, (from.scale * distance(a, b)) / from.distance);
      scale.set(s);
      x.set(now.x - cx - s * px);
      y.set(now.y - cy - s * py);
    };
    const offs = [a.x, a.y, b.x, b.y].map((value) =>
      value.on('change', update),
    );
    return () => offs.forEach((off) => off());
  };

  useGesture({
    onPointer: (_, pointers) => {
      stop.current?.();
      stop.current = undefined;
      const [a, b] = [...pointers.values()].filter((p) => p.end === undefined);
      const onPhoto = a !== undefined && card.current?.contains(a.target);
      if (!onPhoto || b === undefined) return setPinching(false);
      [scale, x, y].forEach((value) => value.stop());
      setPinching(true);
      stop.current = follow(a, b);
    },
    onEnd: () => {
      stop.current?.();
      stop.current = undefined;
      setPinching(false);
      [scale, x, y].forEach((value) =>
        animate(value, value === scale ? 1 : 0, SPRING),
      );
    },
  });

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      onScroll={() => setScrolling(true)}
      onScrollEnd={() => setScrolling(false)}
    >
      <ul className="flex flex-col divide-y divide-border">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="px-4 py-3 text-sm">
            Row {i + 1}
          </li>
        ))}
      </ul>
      <div className="px-4 py-3">
        <div ref={card} className="relative aspect-4/3 rounded-lg bg-muted">
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-lg"
            style={{ scale, x, y }}
          >
            <Photo />
          </motion.div>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {Array.from({ length: 30 }, (_, i) => (
          <li key={i} className="px-4 py-3 text-sm">
            Row {i + 5}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A made-up landscape: sky, sun and two ridges. */
function Photo() {
  return (
    <div className="absolute inset-0 bg-linear-to-b from-sky-400 to-orange-200">
      <div className="absolute top-[18%] right-[22%] size-8 rounded-full bg-amber-50" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-emerald-700 [clip-path:polygon(0_55%,28%_10%,52%_50%,74%_20%,100%_45%,100%_100%,0_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-emerald-950 [clip-path:polygon(0_40%,35%_75%,62%_30%,100%_65%,100%_100%,0_100%)]" />
    </div>
  );
}
