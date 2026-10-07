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

/** One touch as Gesture Handler reports it, for the UI thread. */
type Touch = {
  readonly id: number;
  readonly absoluteX: number;
  readonly absoluteY: number;
};

/**
 * In development only, puts `sink` at `globalThis.__touches[name]` so a
 * script talking to the app through Metro's inspector can touch the screen
 * with any number of fingers, which the Simulator's own tools cannot: a
 * thumb held still while another finger swipes. Its samples go into the
 * same core as real touches, landing in the surface's own zone, and each
 * also goes to `onUI`, for the surface's provider on the UI thread. Returns
 * the removal. A release build never
 * calls it: the caller guards it with `__DEV__`, which Metro strips.
 */
export const exposeDevTouches = (
  name: string,
  sink: PointerSink<Point>,
  clock: () => number,
  onUI: (kind: 'down' | 'move' | 'up' | 'cancel', touch: Touch) => void,
) => {
  const touch = (id: number, x: number, y: number): Touch => ({
    id,
    absoluteX: x,
    absoluteY: y,
  });
  const at = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    t: clock(),
    target: { x, y },
  });
  const registry = (host.__touches ??= {});
  registry[name] = {
    down: (id, x, y) => {
      onUI('down', touch(id, x, y));
      return sink.down(at(id, x, y));
    },
    move: (id, x, y) => {
      onUI('move', touch(id, x, y));
      sink.move(at(id, x, y));
    },
    up: (id, x, y) => {
      onUI('up', touch(id, x, y));
      return sink.up(at(id, x, y));
    },
    cancel: () => {
      onUI('cancel', touch(0, 0, 0));
      sink.cancelAll(clock());
    },
  };
  return () => {
    delete registry[name];
  };
};
