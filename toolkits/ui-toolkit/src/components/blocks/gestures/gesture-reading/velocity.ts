import type { GestureValues } from './gesture-reading';

// Speed is measured over the last stretch of movement only, so a Gesture
// that slows to a stop before the fingers lift reads as a stop.
const WINDOW_MS = 80;

type Sample = { readonly values: GestureValues; readonly t: number };

const STILL: GestureValues = { x: 0, y: 0, scale: 0, rotation: 0 };

/**
 * The Gesture's recent values, and their speed per second at a given moment:
 * from the samples in the 80ms before it only, so values held still for
 * longer read as 0, whatever they did before.
 */
export const createVelocityTracker = () => {
  const samples: Array<Sample> = [];
  return {
    reset: () => {
      samples.length = 0;
    },
    add: (values: GestureValues, t: number) => {
      samples.push({ values, t });
      while (t - samples[0].t > WINDOW_MS) samples.shift();
    },
    at: (t: number): GestureValues => {
      const recent = samples.filter((sample) => t - sample.t <= WINDOW_MS);
      const first = recent[0];
      const last = recent.at(-1);
      if (first === undefined || last === undefined) return STILL;
      const seconds = (last.t - first.t) / 1000;
      if (seconds <= 0) return STILL;
      return {
        x: (last.values.x - first.values.x) / seconds,
        y: (last.values.y - first.values.y) / seconds,
        scale: (last.values.scale - first.values.scale) / seconds,
        rotation: (last.values.rotation - first.values.rotation) / seconds,
      };
    },
  };
};
