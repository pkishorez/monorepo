import { Cause, Duration, Effect, Stream } from 'effect';
import type { Leadership } from '../store/contract/index.js';
import {
  settledCursor,
  type StrategyYield,
  type SyncStrategy,
} from '../strategy/index.js';

export type SessionConfig<TItem, TState, R> = {
  /** Names the lock and nothing else: one Session per key runs at a time. */
  readonly key: string;
  readonly leadership: Leadership;
  readonly strategy: SyncStrategy<TItem, TState, R>;
  readonly settleWindow: Duration.Duration;
  /** Reads the saved Sync State. */
  readonly load: Effect.Effect<TState, unknown>;
  /** Stores one yield: its Entities and its Sync State in one write. */
  readonly commit: (
    yielded: StrategyYield<TItem, TState>,
  ) => Effect.Effect<void, unknown>;
  /** A failure this says is final stops the Session instead of retrying it. */
  readonly isFinal: (cause: Cause.Cause<unknown>) => Effect.Effect<boolean>;
  readonly onFailure: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
};

const FIRST_RETRY = Duration.seconds(1);
const LAST_RETRY = Duration.seconds(30);

/**
 * Runs one Sync Strategy over one scope: waits for Leadership, resumes the
 * strategy from saved Sync State, and stores what it yields. A failed run
 * releases Leadership, waits a growing delay, and runs again from saved state;
 * the delay starts over once a run stores something. It ends when the
 * strategy ends, or when a failure is final.
 */
export const runSession = <TItem, TState, R>(
  config: SessionConfig<TItem, TState, R>,
): Effect.Effect<void, never, R> => {
  const settle = settledCursor(Duration.toMillis(config.settleWindow));
  let stored = false;

  const run = Effect.gen(function* () {
    const state = yield* config.load;
    yield* config.strategy.run({ state, settledCursor: settle }).pipe(
      Stream.runForEach((yielded) =>
        config.commit(yielded).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              stored = true;
            }),
          ),
        ),
      ),
    );
  });

  const attempt = config.leadership.run(config.key, run).pipe(
    Effect.as(true),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.flatMap(config.isFinal(cause), (final) =>
            final
              ? Effect.succeed(true)
              : config.onFailure(cause).pipe(Effect.as(false)),
          ),
    ),
  );

  const loop = (delay: Duration.Duration): Effect.Effect<void, never, R> =>
    Effect.suspend(() => {
      stored = false;
      return attempt;
    }).pipe(
      Effect.flatMap((done) => {
        if (done) return Effect.void;
        const wait = stored ? FIRST_RETRY : delay;
        return Effect.sleep(wait).pipe(
          Effect.andThen(
            loop(Duration.min(Duration.times(wait, 2), LAST_RETRY)),
          ),
        );
      }),
    ) as Effect.Effect<void, never, R>;

  return loop(FIRST_RETRY);
};
