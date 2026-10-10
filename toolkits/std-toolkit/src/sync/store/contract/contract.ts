import { Effect, Stream, type Layer } from 'effect';
import type { StdTableService } from '../../../db/index.js';
import type { SYNC_STORE_TABLE } from '../../domain/stored-entity/index.js';

/** The table a Std Sync keeps its Sync Replicas and Sync State in. */
export type SyncTableLayer = Layer.Layer<
  StdTableService<typeof SYNC_STORE_TABLE>
>;

/**
 * Runs an effect only while this participant holds the lock named `key`,
 * waiting for it first. Without a lock to share, `run` is the effect itself.
 */
export type Leadership = {
  readonly run: <A, E, R>(
    key: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
};

/**
 * Tells other participants that a topic changed. It carries no data: a
 * listener re-reads the Sync Store.
 */
export type Doorbell = {
  readonly ring: (topic: string) => Effect.Effect<void>;
  readonly listen: (topic: string) => Stream.Stream<void>;
};

/**
 * Where a Std Sync is kept: its table, and the Leadership and Doorbell that
 * place needs when other participants share it. A Sync adapter builds one.
 */
export type SyncStore = {
  readonly table: (syncName: string) => SyncTableLayer;
  readonly leadership: Leadership;
  readonly doorbell: Doorbell;
};

/** The Doorbell topic a Std Sync listens on to learn its storage was deleted. */
export const closedTopic = (syncName: string) => `${syncName}#closed`;

export const noLeadership: Leadership = { run: (_key, effect) => effect };

export const noDoorbell: Doorbell = {
  ring: () => Effect.void,
  listen: () => Stream.never,
};
