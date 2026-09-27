// Velocity is measured over the last stretch of movement only, so a drag
// that slows to a stop before release reads as a stop, not a flick.
const WINDOW_MS = 100;

type Sample = { readonly position: number; readonly t: number };

/** Tracks one axis position over time and reports its release velocity in px/ms. */
export const createVelocityTracker = () => {
  const samples: Array<Sample> = [];
  return {
    add: (position: number, t: number) => {
      samples.push({ position, t });
      while (samples.length > 2 && t - samples[0].t > WINDOW_MS) {
        samples.shift();
      }
    },
    velocity: (): number => {
      const first = samples[0];
      const last = samples.at(-1);
      if (first === undefined || last === undefined) return 0;
      const elapsed = last.t - first.t;
      return elapsed > 0 ? (last.position - first.position) / elapsed : 0;
    },
  };
};
