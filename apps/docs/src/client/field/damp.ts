/*
 * Smoothing that does not care about the frame rate. A Spring follows its
 * target critically damped, so it starts gently, never overshoots and never
 * snaps; `ease` closes a set share of the gap per second.
 */

export type Spring = {
  value: number;
  velocity: number;
  /** Follows `target` for `dt` seconds; about `time` seconds to catch up. */
  readonly step: (target: number, dt: number) => number;
};

export function spring(value: number, time: number): Spring {
  const s: Spring = {
    value,
    velocity: 0,
    step(target, dt) {
      const omega = 2 / time;
      const x = omega * dt;
      const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = s.value - target;
      const temp = (s.velocity + omega * change) * dt;
      s.velocity = (s.velocity - omega * temp) * decay;
      s.value = target + (change + temp) * decay;
      if (Math.abs(s.value - target) < 1e-5 && Math.abs(s.velocity) < 1e-4) {
        s.value = target;
        s.velocity = 0;
      }
      return s.value;
    },
  };
  return s;
}

/** Moves `value` towards `target`, closing most of the gap in `time` seconds. */
export function ease(
  value: number,
  target: number,
  time: number,
  dt: number,
): number {
  const next = target + (value - target) * Math.exp((-dt * 3) / time);
  return Math.abs(next - target) < 1e-4 ? target : next;
}
