import type { Schema, Stream } from 'effect';
import { uTime, type Entity } from '../../core/index.js';

/**
 * The Collection's Entity codec. A state schema uses it for every Entity it
 * holds, so a cursor is stored in encoded form and migrated when it is read.
 */
export type StateEntitySchema = Schema.Codec<
  Entity<any>,
  unknown,
  never,
  never
>;

/** One thing a strategy read: the Entities and the Sync State that follows them. */
export type StrategyYield<TItem, TState> = {
  readonly entities: ReadonlyArray<Entity<TItem>>;
  readonly state: TState;
};

export type StrategyContext<TItem, TState> = {
  /** The saved Sync State to resume from. */
  readonly state: TState;
  /**
   * The furthest Entity of a forward batch that is safe to save as a cursor
   * under the Collection's Settle Window, or `null` when none is.
   */
  readonly settledCursor: (
    batch: ReadonlyArray<Entity<TItem>>,
  ) => Entity<TItem> | null;
};

/**
 * A policy for reading one scope of the Backend. `run` yields Entities with
 * the next Sync State; the engine stores each yield in one write and reruns
 * the strategy from saved state when it fails. When the Stream ends, the
 * strategy is done until its scope mounts again.
 */
export type SyncStrategy<TItem, TState = any, R = never> = {
  readonly name: string;
  readonly state: (
    entity: StateEntitySchema,
  ) => Schema.Codec<TState, unknown, never, never>;
  readonly initial: TState;
  readonly run: (
    context: StrategyContext<TItem, TState>,
  ) => Stream.Stream<StrategyYield<TItem, TState>, unknown, R>;
};

export const make = <TItem, TState, R = never>(
  strategy: SyncStrategy<TItem, TState, R>,
): SyncStrategy<TItem, TState, R> => strategy;

export const newestOf = <TItem>(
  batch: ReadonlyArray<Entity<TItem>>,
): Entity<TItem> =>
  batch.reduce((newest, entity) =>
    entity.meta._u > newest.meta._u ? entity : newest,
  );

export const oldestOf = <TItem>(
  batch: ReadonlyArray<Entity<TItem>>,
): Entity<TItem> =>
  batch.reduce((oldest, entity) =>
    entity.meta._u < oldest.meta._u ? entity : oldest,
  );

/**
 * Builds the `settledCursor` a strategy receives. The window is measured back
 * from the newest `_u` in the batch, never from the device clock, so clock
 * skew cannot defeat it. A `_u` that is neither a ULID nor an ISO time cannot
 * be measured, so its batch settles at its newest Entity.
 */
export const settledCursor =
  (windowMillis: number) =>
  <TItem>(batch: ReadonlyArray<Entity<TItem>>): Entity<TItem> | null => {
    if (batch.length === 0) return null;
    const newest = newestOf(batch);
    if (windowMillis <= 0) return newest;
    const top = uTime(newest.meta._u);
    if (top === null) return newest;
    const bound = top - windowMillis;
    let settled: Entity<TItem> | null = null;
    for (const entity of batch) {
      const time = uTime(entity.meta._u);
      if (time === null || time > bound) continue;
      if (settled === null || entity.meta._u > settled.meta._u)
        settled = entity;
    }
    return settled;
  };
