import {
  Context,
  Duration,
  Effect,
  Option,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import type { Strategy } from './strategy/index.js';
import type { Message } from './model.js';
import type { Opened } from './opened.js';
import { scopeOf, type WindowAt } from './windows.js';

/*
 * One Strategy, for a whole Collection or one Window of it, run while its
 * Instance leads and its Gate is open: from the cursor the Store holds for
 * its scope, keeping each yield in one write. Its first answer makes its
 * scope Caught Up, once what it held is kept; with no cursor saved yet, that
 * answer saves one even when it holds nothing, so the Store remembers the
 * scope was synced once and is not Never Synced. A failure tries again from the
 * saved cursor, waiting longer each time; an Entity newer than this app
 * knows stops it until a reload.
 */

const FIRST_RETRY = Duration.seconds(1);
const LAST_RETRY = Duration.seconds(30);

/**
 * What the app does when a Strategy meets an Entity newer than it knows,
 * just before it stops until a reload: nothing, unless the app's Layer gives
 * it something quick, such as asking for its newest build.
 */
export const OnOutdated = Context.Reference<Effect.Effect<void>>(
  '@kestack/std-toolkit/replica/OnOutdated',
  { defaultValue: () => Effect.void },
);

/** The Strategy stopped on purpose: what it read is newer than this app. */
class Outdated {
  readonly _tag = 'Outdated';
}

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export const runStrategy = <K, R>(options: {
  readonly collection: string;
  /** The Window it reads, or `null` for the whole Collection. */
  readonly window: WindowAt | null;
  readonly strategy: Strategy<K, unknown, R>;
  readonly key: K;
  readonly opened: Opened;
  readonly send: (message: Message) => Effect.Effect<void>;
}): Effect.Effect<void, never, R> => {
  const { collection, window, strategy, key, opened, send } = options;
  const scope = scopeOf(window);
  const at = { collection, window };
  const decode = Schema.decodeUnknownOption(strategy.state);
  const encode = Schema.encodeSync(strategy.state);
  let failing = false;
  let answered = false;

  // A cursor saved by another Strategy, or one that no longer fits, starts
  // over. Whether one was saved at all is kept too: until one is, the first
  // answer is written whatever it holds.
  const start = opened.space.cursor(collection, scope).pipe(
    Effect.map((saved) => ({
      saved: saved !== null,
      state:
        saved?.strategy === strategy.name
          ? Option.getOrElse(decode(saved.state), () => strategy.initial)
          : strategy.initial,
    })),
  );

  const kept = Effect.suspend(() => {
    if (!failing) return Effect.void;
    failing = false;
    return send({ _tag: 'Recovered', ...at });
  });

  const answer = Effect.suspend(() => {
    if (answered) return Effect.void;
    answered = true;
    return send({ _tag: 'Answered', ...at });
  });

  const once = Effect.gen(function* () {
    const { saved, state } = yield* start;
    // An answer with nothing new and the same cursor has nothing to write,
    // once a cursor is saved.
    let written = saved ? JSON.stringify(encode(state)) : null;
    yield* strategy.run({ key, state }).pipe(
      Stream.runForEach((pulled) => {
        const cursor = encode(pulled.state);
        const text = JSON.stringify(cursor);
        const unchanged = pulled.entities.length === 0 && text === written;
        written = text;
        return (
          unchanged
            ? Effect.succeed('kept' as const)
            : opened.keep(collection, pulled.entities, {
                scope,
                strategy: strategy.name,
                state: cursor,
              })
        ).pipe(
          Effect.tap(() => answer),
          Effect.flatMap((result) =>
            result === 'outdated'
              ? // Told first: the Outdated Message stops this Strategy.
                Effect.flatMap(Effect.service(OnOutdated), (tell) => tell).pipe(
                  Effect.andThen(send({ _tag: 'Outdated', ...at })),
                  Effect.andThen(Effect.fail(new Outdated())),
                )
              : kept,
          ),
        );
      }),
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
            send({ _tag: 'Failed', ...at, message: messageOf(cause) }),
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
