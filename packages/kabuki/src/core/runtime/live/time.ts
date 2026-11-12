/**
 * The app's Time, in milliseconds: the Time it carries on from plus what the
 * clock has run since, counting only while the Runtime runs. Stopped, it
 * stands still, and started again it carries on from there; a Fork sets it
 * to the Time of the entry the Head moves to.
 */
export const makeTime = (nanos: () => bigint, from: number) => {
  let origin = nanos();
  let base = from;
  let stoppedAt: number | undefined;
  const now = () => stoppedAt ?? base + Number(nanos() - origin) / 1_000_000;
  return {
    now,
    /** Stand still, at `at` if given, else where it is now. */
    stop: (at?: number) => {
      stoppedAt = at ?? stoppedAt ?? now();
    },
    /** Count again, from where it stands. */
    start: () => {
      base = now();
      origin = nanos();
      stoppedAt = undefined;
    },
  };
};
