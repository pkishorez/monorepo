import { Duration, Effect, Option, Schedule, Stream } from 'effect';
import type { Entity } from '../../core/index.js';

/** An Entity as the Backend sends it: its value in encoded form. */
export type Wire = Entity<unknown>;

/** Tied update versions still name different positions in a paged response. */
export const samePosition = (left: Wire, right: Wire) =>
  left.meta._u === right.meta._u &&
  JSON.stringify(left) === JSON.stringify(right);

export type Fetch<K, R> = (input: {
  readonly key: K;
  readonly after: Wire | null;
}) => Effect.Effect<ReadonlyArray<Wire>, unknown, R>;

export type Subscribe<K, R> = (input: {
  readonly key: K;
  readonly after: Wire | null;
}) => Stream.Stream<ReadonlyArray<Wire>, unknown, R>;

/** How a Strategy reads forward: pull with `fetch`, be pushed by `subscribe`, or both. */
export type ForwardOptions<K, R> =
  | {
      readonly fetch: Fetch<K, R>;
      readonly pollEvery?: Duration.Input;
      readonly subscribe?: never;
    }
  | {
      readonly fetch?: Fetch<K, R>;
      readonly subscribe: Subscribe<K, R>;
      readonly pollEvery?: never;
    };

type Batch = readonly [Wire, ...Wire[]];

// A live feed that closes is reopened from the last cursor after this delay.
const REOPEN_DELAY = Duration.seconds(1);

const isBatch = (batch: ReadonlyArray<Wire>): batch is Batch =>
  batch.length > 0;

export const newestOf = (batch: ReadonlyArray<Wire>): Wire =>
  batch.reduce((newest, entity) =>
    entity.meta._u >= newest.meta._u ? entity : newest,
  );

export const oldestOf = (batch: ReadonlyArray<Wire>): Wire =>
  batch.reduce((oldest, entity) =>
    entity.meta._u < oldest.meta._u ? entity : oldest,
  );

/**
 * Reads forward for one Key from a cursor and yields every non-empty batch.
 * `from` is read again at the start of every cycle.
 *
 * - `fetch` only: catch up, then poll every `pollEvery`, or end without it.
 * - `subscribe` only: the Backend replays everything after the cursor, then
 *   stays live.
 * - both: catch up with `fetch`, then go live with `subscribe`.
 */
export const readForward = <K, R>(
  options: ForwardOptions<K, R>,
  key: K,
  from: () => Wire | null,
): Stream.Stream<Batch, unknown, R> => {
  let reading: Wire | null = null;
  const advance = (batch: Batch) => {
    const newest = newestOf(batch);
    if (reading === null || newest.meta._u >= reading.meta._u) reading = newest;
    return batch;
  };

  const catchUp = (fetch: Fetch<K, R>) =>
    Stream.paginate(reading, (cursor) =>
      fetch({ key, after: cursor }).pipe(
        Effect.map((page) => {
          if (!isBatch(page)) return [[], Option.none()] as const;
          const next = newestOf(page);
          // A Backend whose cursor is inclusive returns the last page forever,
          // so stop as soon as the cursor stops moving.
          const stuck =
            cursor !== null &&
            (next.meta._u < cursor.meta._u || samePosition(next, cursor));
          return [[page], stuck ? Option.none() : Option.some(next)] as const;
        }),
      ),
    ).pipe(Stream.map(advance));

  const live = (subscribe: Subscribe<K, R>) =>
    Stream.suspend(() => subscribe({ key, after: reading })).pipe(
      Stream.filter(isBatch),
      Stream.map(advance),
    );

  const cycle = (body: () => Stream.Stream<Batch, unknown, R>) =>
    Stream.suspend(() => {
      reading = from();
      return body();
    });

  const { fetch, subscribe } = options;
  if (subscribe) {
    const body = fetch
      ? () => Stream.concat(catchUp(fetch), live(subscribe))
      : () => live(subscribe);
    return cycle(body).pipe(Stream.repeat(Schedule.spaced(REOPEN_DELAY)));
  }
  const once = cycle(() => catchUp(fetch));
  return options.pollEvery === undefined
    ? once
    : once.pipe(Stream.repeat(Schedule.spaced(options.pollEvery)));
};
