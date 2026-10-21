import { Duration, Effect, Option, Schedule, Schema, Stream } from 'effect';
import type { Strategy } from '../strategy/index.js';
import type { Message } from './model.js';
import type { Opened } from './opened.js';

/*
 * One Collection's Strategy, run while its Instance leads and its Gate is
 * open: from the cursor the Store holds, keeping each yield in one write.
 * A failure tries again from the saved cursor, waiting longer each time; an
 * Entity newer than this app knows stops it until a reload.
 */

const FIRST_RETRY = Duration.seconds(1);
const LAST_RETRY = Duration.seconds(30);

/** The Strategy stopped on purpose: what it read is newer than this app. */
class Outdated {
  readonly _tag = 'Outdated';
}

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export const runStrategy = <K, R>(options: {
  readonly collection: string;
  readonly strategy: Strategy<K, unknown, R>;
  readonly key: K;
  readonly opened: Opened;
  readonly send: (message: Message) => Effect.Effect<void>;
}): Effect.Effect<void, never, R> => {
  const { collection, strategy, key, opened, send } = options;
  const decode = Schema.decodeUnknownOption(strategy.state);
  const encode = Schema.encodeSync(strategy.state);
  let failing = false;

  // A cursor saved by another Strategy, or one that no longer fits, starts over.
  const start = opened.space
    .cursor(collection)
    .pipe(
      Effect.map((saved) =>
        saved?.strategy === strategy.name
          ? Option.getOrElse(decode(saved.state), () => strategy.initial)
          : strategy.initial,
      ),
    );

  const kept = Effect.suspend(() => {
    if (!failing) return Effect.void;
    failing = false;
    return send({ _tag: 'Recovered', collection });
  });

  const once = Effect.gen(function* () {
    const state = yield* start;
    yield* strategy.run({ key, state }).pipe(
      Stream.runForEach((pulled) =>
        opened
          .keep(collection, pulled.entities, {
            strategy: strategy.name,
            state: encode(pulled.state),
          })
          .pipe(
            Effect.flatMap((result) =>
              result === 'outdated'
                ? Effect.andThen(
                    send({ _tag: 'Outdated', collection }),
                    Effect.fail(new Outdated()),
                  )
                : kept,
            ),
          ),
      ),
    );
  });

  return once.pipe(
    Effect.tapError((cause) =>
      cause instanceof Outdated
        ? Effect.void
        : Effect.andThen(
            Effect.sync(() => {
              failing = true;
            }),
            send({ _tag: 'Failed', collection, message: messageOf(cause) }),
          ),
    ),
    Effect.retry({
      while: (cause) => !(cause instanceof Outdated),
      schedule: Schedule.exponential(FIRST_RETRY).pipe(
        Schedule.modifyDelay(({ output }) =>
          Effect.succeed(Duration.min(output, LAST_RETRY)),
        ),
      ),
    }),
    Effect.ignore,
  );
};
