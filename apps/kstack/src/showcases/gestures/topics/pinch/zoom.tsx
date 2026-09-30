import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from 'motion/react';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const MIN = 1;
const MAX = 4;
const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.25 } as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Past a limit the photo still follows the fingers, but less and less.
const rubber = (scale: number) =>
  scale > MAX
    ? MAX * (scale / MAX) ** 0.25
    : scale < MIN
      ? MIN * (scale / MIN) ** 0.25
      : scale;

const midpoint = (a: Pointer, b: Pointer) => ({
  x: (a.x.get() + b.x.get()) / 2,
  y: (a.y.get() + b.y.get()) / 2,
});

const distance = (a: Pointer, b: Pointer) =>
  Math.hypot(a.x.get() - b.x.get(), a.y.get() - b.y.get());

/**
 * A photo that zooms around the midpoint of two fingers. Letting go springs
 * it back between 1× and 4×, with no gap at the frame's edges.
 */
export function Zoom() {
  const frame = useRef<HTMLDivElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const stop = useRef<() => void>(undefined);
  const [pinching, setPinching] = useState(false);
  const [shown, setShown] = useState(1);
  useMotionValueEvent(scale, 'change', (value) =>
    setShown(Math.round(value * 10) / 10),
  );
  useStageStatus(
    pinching
      ? `Pinching · ${shown.toFixed(1)}×`
      : shown > 1
        ? `${shown.toFixed(1)}×`
        : undefined,
  );

  // From now on, the photo point under the fingers' midpoint stays under it.
  const follow = (a: Pointer, b: Pointer) => {
    const rect = frame.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const from = { scale: scale.get(), distance: distance(a, b) };
    const mid = midpoint(a, b);
    const px = (mid.x - cx - x.get()) / from.scale;
    const py = (mid.y - cy - y.get()) / from.scale;
    const update = () => {
      const now = midpoint(a, b);
      const s = rubber((from.scale * distance(a, b)) / from.distance);
      scale.set(s);
      x.set(now.x - cx - s * px);
      y.set(now.y - cy - s * py);
    };
    const offs = [a.x, a.y, b.x, b.y].map((value) =>
      value.on('change', update),
    );
    return () => offs.forEach((off) => off());
  };

  const settle = () => {
    const rect = frame.current!.getBoundingClientRect();
    const s = clamp(scale.get(), MIN, MAX);
    const k = s / scale.get();
    const maxX = (rect.width * (s - 1)) / 2;
    const maxY = (rect.height * (s - 1)) / 2;
    animate(scale, s, SPRING);
    animate(x, clamp(x.get() * k, -maxX, maxX), SPRING);
    animate(y, clamp(y.get() * k, -maxY, maxY), SPRING);
  };

  useGesture({
    onPointer: (_, pointers) => {
      stop.current?.();
      stop.current = undefined;
      const [a, b] = [...pointers.values()].filter((p) => p.end === undefined);
      setPinching(a !== undefined && b !== undefined);
      if (a === undefined || b === undefined) return;
      [scale, x, y].forEach((value) => value.stop());
      stop.current = follow(a, b);
    },
    onEnd: () => {
      stop.current?.();
      stop.current = undefined;
      setPinching(false);
      settle();
    },
  });

  return (
    <div className="absolute inset-0 p-4">
      <div
        ref={frame}
        className="relative size-full overflow-hidden rounded-lg bg-muted"
      >
        <motion.div className="absolute inset-0" style={{ scale, x, y }}>
          <Photo />
        </motion.div>
      </div>
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
