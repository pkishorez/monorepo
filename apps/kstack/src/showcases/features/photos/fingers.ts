import type { Pointer, Pointers } from '@kstackz/use-gesture/core';

/** The fingers of a Gesture that are still down, in landing order. */
export const down = (pointers: Pointers) =>
  [...pointers.values()].filter((pointer) => pointer.end === undefined);

/** The point halfway between two fingers, and how far apart they are, in viewport px. */
export const between = (a: Pointer, b: Pointer) => ({
  x: (a.x.get() + b.x.get()) / 2,
  y: (a.y.get() + b.y.get()) / 2,
  d: Math.hypot(a.x.get() - b.x.get(), a.y.get() - b.y.get()),
});

/** Calls `follow` each time any of these fingers moves; returns the stop. */
export const track = (fingers: ReadonlyArray<Pointer>, follow: () => void) => {
  const offs = fingers.flatMap((f) => [
    f.x.on('change', follow),
    f.y.on('change', follow),
  ]);
  return () => offs.forEach((off) => off());
};
