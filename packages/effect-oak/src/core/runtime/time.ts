import { Duration, Effect } from 'effect';
import type { Clock } from 'effect';

/*
 * The app's Time: milliseconds since the Runtime started, not counting time
 * spent paused. It is also a Clock for Commands and Lifetimes, so a timer
 * stops while the app is paused and carries on when it resumes.
 */
export interface Time {
  readonly now: () => number;
  readonly pause: () => void;
  readonly resume: () => void;
  /** Effect's Clock, sleeping in the app's Time. */
  readonly clock: Clock.Clock;
}

export const makeTime = (outside: Clock.Clock): Time => {
  const origin = outside.monotonicTimeNanosUnsafe();
  const elapsed = () =>
    Number(outside.monotonicTimeNanosUnsafe() - origin) / 1_000_000;
  let paused = 0;
  let stoppedAt: number | undefined;
  const now = () => stoppedAt ?? elapsed() - paused;

  // Sleepers wake on every pause and resume, and go back to sleep for what is left.
  const sleepers = new Set<() => void>();
  const wake = () => {
    for (const sleeper of [...sleepers]) sleeper();
  };
  const nextChange = Effect.callback<void>((resume) => {
    const sleeper = () => resume(Effect.void);
    sleepers.add(sleeper);
    return Effect.sync(() => sleepers.delete(sleeper));
  });
  const until = (due: number): Effect.Effect<void> =>
    Effect.suspend(() => {
      const left = due - now();
      if (stoppedAt === undefined && left <= 0) return Effect.void;
      const sleeping =
        stoppedAt === undefined
          ? outside.sleep(Duration.millis(left))
          : Effect.never;
      return Effect.raceFirst(sleeping, nextChange).pipe(
        Effect.andThen(until(due)),
      );
    });

  return {
    now,
    pause: () => {
      if (stoppedAt !== undefined) return;
      stoppedAt = now();
      wake();
    },
    resume: () => {
      if (stoppedAt === undefined) return;
      paused = elapsed() - stoppedAt;
      stoppedAt = undefined;
      wake();
    },
    clock: {
      ...outside,
      currentTimeMillisUnsafe: () => outside.currentTimeMillisUnsafe(),
      currentTimeNanosUnsafe: () => outside.currentTimeNanosUnsafe(),
      monotonicTimeNanosUnsafe: () => outside.monotonicTimeNanosUnsafe(),
      sleep: (duration) =>
        Effect.suspend(() => until(now() + Duration.toMillis(duration))),
    },
  };
};
