import { Duration, Effect, Option, Schedule, Stream } from 'effect';
import { uTime, type Entity } from '../../../../core/index.js';

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
export type ForwardOptions<K, R> = {
  /**
   * How long the Backend may take to make a write readable: each read starts
   * that far back from the newest change read, so a write that became
   * readable late is not skipped. Off unless given.
   */
  readonly settleWindow?: Duration.Input;
} & (
  | {
      readonly fetch: Fetch<K, R>;
      readonly pollEvery?: Duration.Input;
      readonly subscribe?: never;
    }
  | {
      readonly fetch?: Fetch<K, R>;
      readonly subscribe: Subscribe<K, R>;
      readonly pollEvery?: never;
    }
);

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
 * The newest Entity read so far that a cursor may stop at: none newer than
 * the newest `_u` read less `window`, measured on `_u`, never on this
 * device's clock. It remembers across batches, so pages shorter than the
 * window still settle as newer ones arrive. An Entity whose `_u` is neither
 * a ULID nor a time cannot be measured, so it settles at once.
 */
export const settledOf = (window: Duration.Input | undefined) => {
  const millis =
    window === undefined
      ? 0
      : Duration.toMillis(Duration.fromInputUnsafe(window));
  let top = -Infinity;
  let pending: Wire[] = [];
  let settled: Wire | null = null;
  const keep = (entity: Wire) => {
    // Of records tied on `_u`, the one read last: reading resumes after it.
    if (settled === null || entity.meta._u >= settled.meta._u) settled = entity;
  };
  return (batch: ReadonlyArray<Wire>): Wire | null => {
    if (batch.length === 0) return settled;
    if (millis <= 0) {
      keep(newestOf(batch));
      return settled;
    }
    for (const entity of batch) {
      const time = uTime(entity.meta._u);
      if (time === null) keep(entity);
      else {
        top = Math.max(top, time);
        pending.push(entity);
      }
    }
    pending = pending.filter((entity) => {
      if (uTime(entity.meta._u)! > top - millis) return true;
      keep(entity);
      return false;
    });
    return settled;
  };
};

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
