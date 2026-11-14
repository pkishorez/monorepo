/**
 * The app's Time, in milliseconds: the Time it carries on from plus what the
 * clock has run since, counting only while the Runtime runs. It stands
 * still from the moment it is made until it is started, and whenever it is
 * stopped, and started again it carries on from there; following a Snapshot
 * sets it to that Snapshot's Time.
 */
export const makeTime = (nanos: () => bigint, from: number) => {
  let origin = nanos();
  let base = from;
  let stoppedAt: number | undefined = from;
  const now = () => stoppedAt ?? base + Number(nanos() - origin) / 1_000_000;
  return {
    now,
    /** Stand still, where it is now. */
    stop: () => {
      stoppedAt ??= now();
    },
    /** Count again, from where it stands. */
    start: () => {
      base = now();
      origin = nanos();
      stoppedAt = undefined;
    },
    /** Carry on from `at`: standing still there if stopped, counting from there if not. */
    set: (at: number) => {
      if (stoppedAt !== undefined) stoppedAt = at;
      else {
        base = at;
        origin = nanos();
      }
    },
  };
};
