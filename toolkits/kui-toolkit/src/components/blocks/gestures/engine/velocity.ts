// Velocity is measured over the last stretch of movement only, so a drag
// that slows to a stop before release reads as a stop, not a flick.
const WINDOW_MS = 100;

type Sample = { readonly x: number; readonly y: number; readonly t: number };

/**
 * One finger's recent positions, and its velocity in px/ms at a given
 * moment: from the samples in the 100ms before it only, so a finger held
 * still for longer reads as 0, whatever it did before.
 */
export const createVelocityTracker = () => {
  const samples: Array<Sample> = [];
  return {
    add: (sample: Sample) => {
      samples.push(sample);
      while (sample.t - samples[0].t > WINDOW_MS) {
        samples.shift();
      }
    },
    at: (t: number): { readonly x: number; readonly y: number } => {
      const recent = samples.filter((sample) => t - sample.t <= WINDOW_MS);
      const first = recent[0];
      const last = recent.at(-1);
      const elapsed =
        first === undefined || last === undefined ? 0 : last.t - first.t;
      if (first === undefined || last === undefined || elapsed <= 0) {
        return { x: 0, y: 0 };
      }
      return {
        x: (last.x - first.x) / elapsed,
        y: (last.y - first.y) / elapsed,
      };
    },
  };
};
