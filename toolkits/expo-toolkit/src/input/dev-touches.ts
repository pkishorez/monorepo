import type { PointerSink } from '@kstackz/use-gesture';
import type { Point } from './zones';

/** Touches a script hands in by hand: a finger id and where it is. */
type DevTouches = {
  readonly down: (id: number, x: number, y: number) => boolean;
  readonly move: (id: number, x: number, y: number) => void;
  readonly up: (id: number, x: number, y: number) => boolean;
  readonly cancel: () => void;
};

type Registry = Record<string, DevTouches>;

const host = globalThis as typeof globalThis & { __touches?: Registry };

/**
 * In development only, puts `sink` at `globalThis.__touches[name]` so a
 * script talking to the app through Metro's inspector can touch the screen
 * with any number of fingers, which the Simulator's own tools cannot: a
 * thumb held still while another finger swipes. Its samples go into the
 * same core as real touches, landing in the surface's own zone. Returns the removal. A release build never
 * calls it: the caller guards it with `__DEV__`, which Metro strips.
 */
export const exposeDevTouches = (
  name: string,
  sink: PointerSink<Point>,
  clock: () => number,
) => {
  const at = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    t: clock(),
    target: { x, y },
  });
  const registry = (host.__touches ??= {});
  registry[name] = {
    down: (id, x, y) => sink.down(at(id, x, y)),
    move: (id, x, y) => sink.move(at(id, x, y)),
    up: (id, x, y) => sink.up(at(id, x, y)),
    cancel: () => sink.cancelAll(clock()),
  };
  return () => {
    delete registry[name];
  };
};
