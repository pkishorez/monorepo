import { Effect, Queue, Schema, Stream, SynchronizedRef } from 'effect';
import { EntityMetaSchema } from '../../../../core/index.js';
import { cover, type Slice } from './coverage.js';
import {
  oldestOf,
  readForward,
  samePosition,
  settledOf,
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

/**
 * One yield of a Strategy: what it read, and the cursor that follows it. Its
 * first yield is its first answer from the Backend, so one with nothing new
 * yields no Entities rather than nothing.
 */
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

/**
 * Reads the Backend from the oldest change forward and keeps the newest
 * Entity read as its cursor, or, with a Settle Window, the newest one older
 * than it.
 */
const oldToNew = <K, R = never>(
  options: ForwardOptions<K, R>,
): Strategy<K, OldToNewState, R> => ({
  name: 'old-to-new',
  state: Schema.Struct({ cursor: Schema.NullOr(WireSchema) }),
  initial: { cursor: null },
  run: ({ key, state }) => {
    const settle = settledOf(options.settleWindow);
    let saved = state.cursor;
    return readForward(options, key, () => saved).pipe(
      Stream.map((batch) => {
        const settled = settle(batch);
        if (settled && (saved === null || settled.meta._u >= saved.meta._u))
          saved = settled;
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
 * so far; they merge into one as the gaps between them close. A Settle
 * Window holds the top back as `oldToNew` holds its cursor.
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
        const settle = settledOf(options.settleWindow);
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
        // With a Settle Window its top is held back as forward reads are,
        // or to its oldest Entity while the whole page is still settling.
        const page = yield* options.fetchOlder({ key, before: null });
        if (page.length > 0) {
          const high = settle(page) ?? page.at(-1)!;
          yield* commit(page, (s) => ({
            ...s,
            reachedOldest: s.reachedOldest && s.slices.length > 0,
            slices: cover(s.slices, { low: page.at(-1)!, high }),
          }));
        } else if (state.slices.length === 0)
          yield* commit([], (s) => ({ ...s, reachedOldest: true }));
        // Nothing newer than what is kept: still an answer.
        else yield* commit([], (s) => s);

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
              yield* commit([], (s) => {
                const upper = s.slices.at(-1)!;
                const lower = s.slices.at(-2);
                return lower === undefined
                  ? { ...s, reachedOldest: true }
                  : {
                      ...s,
                      slices: [
                        ...s.slices.slice(0, -2),
                        { low: lower.low, high: upper.high },
                      ],
                    };
              });
              continue;
            }
            const floor = page.at(-1)!;
            if (
              floor.meta._u > upper.low.meta._u ||
              samePosition(floor, upper.low)
            )
              return;
            yield* commit(page, (s) => {
              const upper = s.slices.at(-1)!;
              const lower = s.slices.at(-2);
              return {
                ...s,
                slices:
                  lower !== undefined &&
                  (floor.meta._u < lower.high.meta._u ||
                    page.some((entity) => samePosition(entity, lower.high)))
                    ? [
                        ...s.slices.slice(0, -2),
                        { low: lower.low, high: upper.high },
                      ]
                    : [
                        ...s.slices.slice(0, -1),
                        { low: floor, high: upper.high },
                      ],
              };
            });
          }
        });

        const forward = readForward(
          options,
          key,
          () => top(SynchronizedRef.getUnsafe(ref))?.high ?? null,
        ).pipe(
          Stream.runForEach((batch) =>
            commit(batch, (s) => {
              if (batch.length === 0) return s;
              const upper = top(s);
              const settled = settle(batch);
              if (settled === null) return s;
              if (upper === undefined)
                return {
                  ...s,
                  slices: [{ low: oldestOf(batch), high: settled }],
                };
              if (settled.meta._u < upper.high.meta._u) return s;
              return {
                ...s,
                slices: cover(s.slices, { low: upper.high, high: settled }),
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
