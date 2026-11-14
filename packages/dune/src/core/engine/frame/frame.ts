/*
 * The engine's pulse: a callback once per display frame, and time as
 * effects see it, which stops while paused.
 */

/** Calls `tick` once per display frame until the returned stop is called. */
export const everyFrame = (tick: (now: number) => void): (() => void) => {
  let id = 0;
  const run = (now: number) => {
    id = requestAnimationFrame(run);
    tick(now);
  };
  id = requestAnimationFrame(run);
  return () => cancelAnimationFrame(id);
};

/** Seconds as effects read them: `u_time` and `u_delta`. */
export class Clock {
  /** Seconds since the canvas started, not counting pauses. */
  time = 0;
  /** Seconds since the last frame drawn. */
  delta = 0;
  paused = false;
  private last = 0;

  /** Seconds since the last call, at most 0.1, so a hidden tab doesn't jump. */
  elapse(now: number): number {
    const dt = Math.min((now - (this.last || now)) / 1000, 0.1);
    this.last = now;
    return dt;
  }

  /** Moves time on, unless paused. */
  advance(dt: number): void {
    if (!this.paused) this.time += dt;
    this.delta = dt;
  }
}
