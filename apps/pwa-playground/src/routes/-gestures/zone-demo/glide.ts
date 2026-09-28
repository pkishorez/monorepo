// A released motion's speed falls to 1/e every this many ms, as in iOS
// scroll views: it travels on about a third of a second's worth of its speed.
const TIME_CONSTANT = 325;

// By then it has less than 1% of its travel left.
const SETTLED = 5 * TIME_CONSTANT;

/** Something moving on its own that can be stopped. */
export type Coast = { readonly stop: () => void };

/** `speed` limited to `max` either way. */
export const cap = (speed: number, max: number) =>
  Math.max(-max, Math.min(max, speed));

/**
 * Carries a released motion on, slowing it smoothly to a stop. `velocity`
 * holds any number of speeds per second; each frame, `step` gets how far
 * each one moved since the last frame, and may return false to stop there.
 */
export const glide = (
  velocity: ReadonlyArray<number>,
  step: (moved: Array<number>) => boolean | void,
): Coast => {
  const start = performance.now();
  // How much of its whole travel the motion has covered `elapsed` ms in.
  const covered = (elapsed: number) =>
    (TIME_CONSTANT / 1000) * (1 - Math.exp(-elapsed / TIME_CONSTANT));
  let last = 0;
  let frame = 0;
  const tick = (now: number) => {
    const elapsed = Math.min(now - start, SETTLED);
    const share = covered(elapsed) - covered(last);
    last = elapsed;
    const going = step(velocity.map((speed) => speed * share)) !== false;
    if (going && elapsed < SETTLED) frame = requestAnimationFrame(tick);
  };
  if (velocity.some((speed) => speed !== 0)) {
    frame = requestAnimationFrame(tick);
  }
  return { stop: () => cancelAnimationFrame(frame) };
};
