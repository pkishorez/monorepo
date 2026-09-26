import { Duration, Effect, Option, Schedule, Stream } from 'effect';
import type { Entity } from '../../core/index.js';
import { newestOf } from './definition.js';

export type Fetch<TItem, R> = (input: {
  readonly after: Entity<TItem> | null;
}) => Effect.Effect<ReadonlyArray<Entity<TItem>>, unknown, R>;

export type Subscribe<TItem, R> = (input: {
  readonly after: Entity<TItem> | null;
}) => Stream.Stream<ReadonlyArray<Entity<TItem>>, unknown, R>;

export type Batch<TItem> = readonly [Entity<TItem>, ...Entity<TItem>[]];

/** How a strategy reads forward: pull with `fetch`, be pushed by `subscribe`, or both. */
export type ForwardOptions<TItem, R> =
  | {
      readonly fetch: Fetch<TItem, R>;
      readonly pollEvery?: Duration.Input;
      readonly subscribe?: never;
    }
  | {
      readonly fetch?: Fetch<TItem, R>;
      readonly subscribe: Subscribe<TItem, R>;
      readonly pollEvery?: never;
    };

// A live feed that closes is reopened from the last cursor after this delay.
const REOPEN_DELAY = Duration.seconds(1);

const isBatch = <TItem>(
  batch: ReadonlyArray<Entity<TItem>>,
): batch is Batch<TItem> => batch.length > 0;

/**
 * Reads forward from a cursor and yields every non-empty batch. `from` is read
 * again at the start of every cycle, so a strategy that saves a cursor behind
 * what it read (the Settle Window) re-reads that stretch each cycle.
 *
 * - `fetch` only: catch up, then poll every `pollEvery`, or end without it.
 * - `subscribe` only: the Backend replays everything after the cursor, then
 *   stays live.
 * - both: catch up with `fetch`, then go live with `subscribe`.
 */
export const readForward = <TItem, R>(
  options: ForwardOptions<TItem, R>,
  from: () => Entity<TItem> | null,
): Stream.Stream<Batch<TItem>, unknown, R> => {
  let reading: Entity<TItem> | null = null;
  const advance = (batch: Batch<TItem>) => {
    const newest = newestOf(batch);
    if (reading === null || newest.meta._u > reading.meta._u) reading = newest;
    return batch;
  };

  const catchUp = (fetch: Fetch<TItem, R>) =>
    Stream.paginate(reading, (cursor) =>
      fetch({ after: cursor }).pipe(
        Effect.map((page) => {
          if (!isBatch(page)) return [[], Option.none()] as const;
          const next = newestOf(page);
          // A Backend whose cursor is inclusive returns the last page forever,
          // so stop as soon as the cursor stops moving.
          const stuck = cursor !== null && next.meta._u <= cursor.meta._u;
          return [[page], stuck ? Option.none() : Option.some(next)] as const;
        }),
      ),
    ).pipe(Stream.map(advance));

  const live = (subscribe: Subscribe<TItem, R>) =>
    Stream.suspend(() => subscribe({ after: reading })).pipe(
      Stream.filter(isBatch),
      Stream.map(advance),
    );

  const cycle = (body: () => Stream.Stream<Batch<TItem>, unknown, R>) =>
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
