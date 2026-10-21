import { Effect, Queue, Schema, Stream, SynchronizedRef } from 'effect';
import { EntityMetaSchema } from '../../core/index.js';
import { cover, type Slice } from './coverage.js';
import {
  newestOf,
  oldestOf,
  readForward,
  type ForwardOptions,
  type Wire,
} from './forward.js';

/*
 * A Strategy is how one Collection reads the Backend for one Key, resuming
 * from its saved cursor. It knows nothing of the Store: it yields Entities,
 * in the encoded form the Backend sends them, with the cursor that follows
 * them, and the Instance keeps each yield in one write. Cursors hold encoded
 * Entities too, so they never need a migration.
 */

/** One yield of a Strategy: what it read, and the cursor that follows it. */
export type Pulled<State> = {
  readonly entities: ReadonlyArray<Wire>;
  readonly state: State;
};

export interface Strategy<K, State = any, R = never> {
  readonly name: string;
  /** The cursor's Schema; a saved cursor that no longer fits starts over from `initial`. */
  readonly state: Schema.Codec<State, unknown, never, never>;
  readonly initial: State;
  readonly run: (context: {
    readonly key: K;
    readonly state: State;
  }) => Stream.Stream<Pulled<State>, unknown, R>;
}

/** An Entity in encoded form, as a cursor keeps it. */
const WireSchema: Schema.Codec<Wire, unknown> = Schema.Struct({
  value: Schema.Unknown,
  meta: EntityMetaSchema,
});

type OldToNewState = { readonly cursor: Wire | null };

/** Reads the Backend from the oldest change forward and keeps the newest Entity read as its cursor. */
const oldToNew = <K, R = never>(
  options: ForwardOptions<K, R>,
): Strategy<K, OldToNewState, R> => ({
  name: 'old-to-new',
  state: Schema.Struct({ cursor: Schema.NullOr(WireSchema) }),
  initial: { cursor: null },
  run: ({ key, state }) => {
    let saved = state.cursor;
    return readForward(options, key, () => saved).pipe(
      Stream.map((batch) => {
        const newest = newestOf(batch);
        if (saved === null || newest.meta._u > saved.meta._u) saved = newest;
        return { entities: batch, state: { cursor: saved } };
      }),
    );
  },
});

type NewToOldState = {
  readonly slices: ReadonlyArray<Slice>;
  readonly reachedOldest: boolean;
};

export type NewToOldOptions<K, R> = ForwardOptions<K, R> & {
  /** The page just older than `before`, newest first; `before: null` is the newest page. */
  readonly fetchOlder: (input: {
    readonly key: K;
    readonly before: Wire | null;
  }) => Effect.Effect<ReadonlyArray<Wire>, unknown, R>;
};

/**
 * Shows the newest Entities first on every open, then fills in older ones
 * while reading forward keeps the top fresh. Its cursor is the stretches read
 * so far; they merge into one as the gaps between them close.
 */
const newToOld = <K, R = never>(
  options: NewToOldOptions<K, R>,
): Strategy<K, NewToOldState, R> => ({
  name: 'new-to-old',
  state: Schema.Struct({
    slices: Schema.Array(Schema.Struct({ low: WireSchema, high: WireSchema })),
    reachedOldest: Schema.Boolean,
  }),
  initial: { slices: [], reachedOldest: false },
  run: ({ key, state }) =>
    Stream.callback<Pulled<NewToOldState>, unknown, R>((queue) =>
      Effect.gen(function* () {
        const ref = yield* SynchronizedRef.make(state);
        // Every change of state and its yield happen in one step, so the
        // yields arrive in the order the state changed.
        const commit = (
          entities: ReadonlyArray<Wire>,
          change: (current: NewToOldState) => NewToOldState,
        ) =>
          SynchronizedRef.modifyEffect(ref, (current) => {
            const next = change(current);
            return Queue.offer(queue, { entities, state: next }).pipe(
              Effect.as([next, next] as const),
            );
          });
        const top = (current: NewToOldState) => current.slices.at(-1);

        // The newest page first, on every open. Above the saved top it is a
        // slice of its own; walking back closes the hole between them.
        if (!(state.slices.length === 0 && state.reachedOldest)) {
          const page = yield* options.fetchOlder({ key, before: null });
          if (page.length > 0)
            yield* commit(page, (s) => ({
              ...s,
              slices: cover(s.slices, {
                low: oldestOf(page),
                high: newestOf(page),
              }),
            }));
          else if (state.slices.length === 0)
            yield* commit([], (s) => ({ ...s, reachedOldest: true }));
        }

        // Walks down from the top slice until it meets the one below, then
        // from the bottom until the Backend has nothing older.
        const backward = Effect.gen(function* () {
          while (true) {
            const { slices, reachedOldest } = yield* SynchronizedRef.get(ref);
            const upper = slices.at(-1);
            const lower = slices.at(-2);
            if (upper === undefined) return;
            if (lower === undefined && reachedOldest) return;
            const page = yield* options.fetchOlder({ key, before: upper.low });
            if (page.length === 0) {
              yield* commit([], (s) =>
                lower === undefined
                  ? { ...s, reachedOldest: true }
                  : {
                      ...s,
                      slices: cover(s.slices, {
                        low: lower.high,
                        high: upper.low,
                      }),
                    },
              );
              continue;
            }
            const floor = oldestOf(page);
            if (floor.meta._u >= upper.low.meta._u) return;
            yield* commit(page, (s) => ({
              ...s,
              slices: cover(s.slices, { low: floor, high: upper.low }),
            }));
          }
        });

        const forward = readForward(
          options,
          key,
          () => top(SynchronizedRef.getUnsafe(ref))?.high ?? null,
        ).pipe(
          Stream.runForEach((batch) =>
            commit(batch, (s) => {
              const upper = top(s);
              const newest = newestOf(batch);
              if (upper === undefined)
                return {
                  ...s,
                  slices: [{ low: oldestOf(batch), high: newest }],
                };
              if (newest.meta._u <= upper.high.meta._u) return s;
              return {
                ...s,
                slices: cover(s.slices, { low: upper.high, high: newest }),
              };
            }),
          ),
        );

        yield* Effect.all([backward, forward], {
          concurrency: 'unbounded',
          discard: true,
        });
      }).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => Queue.failCause(queue, cause),
          onSuccess: () => Queue.end(queue),
        }),
      ),
    ),
});

/** The built-in Strategies. */
export const Strategies = { oldToNew, newToOld };
export type { Wire };
