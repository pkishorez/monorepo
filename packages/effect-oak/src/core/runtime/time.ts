/**
 * The app's Time, in milliseconds: a starting Time plus what the clock has run
 * since. Stopped, it stands still, and time spent stopped is never counted.
 */
export const makeTime = (nanos: () => bigint) => {
  let base = 0;
  let origin = nanos();
  let stoppedAt: number | undefined = 0;
  const now = () => stoppedAt ?? base + Number(nanos() - origin) / 1_000_000;
  return {
    now,
    /** Carry on from `from`, counting from now. */
    start: (from: number) => {
      base = from;
      origin = nanos();
      stoppedAt = undefined;
    },
    stop: () => {
      stoppedAt = now();
    },
  };
};
