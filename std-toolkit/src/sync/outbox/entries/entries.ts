import { Effect } from 'effect';
import type { DatabaseError, StdTableService } from '../../../db/index.js';
import type { HandlerName } from '../../domain/identity/index.js';
import {
  storedOutboxEntryEntity,
  syncStore,
  type StoredOutboxEntryValue,
} from '../../domain/stored-entity/index.js';
import type { DecodedEntity } from '../../../core/index.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';
import {
  decodeEntryBody,
  type OutboxEntry,
  type OutboxStatus,
  type PendingEntry,
  type QueueKey,
} from './entry.js';

export type EntryStore = {
  readonly enqueue: (
    entries: ReadonlyArray<PendingEntry>,
  ) => Effect.Effect<void, WriteError>;
  readonly byId: (id: string) => Effect.Effect<OutboxEntry | null, WriteError>;
  readonly list: () => Effect.Effect<OutboxEntry[], WriteError>;
  readonly queue: (queue: QueueKey) => Effect.Effect<OutboxEntry[], WriteError>;
  // The distinct Queues with unsettled Entries, without decoding any body.
  readonly queues: () => Effect.Effect<Set<QueueKey>, WriteError>;
  readonly setStatus: (
    ids: ReadonlyArray<string>,
    status: OutboxStatus,
  ) => Effect.Effect<void, WriteError>;
  readonly remove: (
    ids: ReadonlyArray<string>,
  ) => Effect.Effect<void, WriteError>;
  readonly resetInFlight: () => Effect.Effect<void, WriteError>;
};

const storeError = (reason: string) => (cause: DatabaseError) =>
  storageError(reason, cause);

const byEnqueuedAt = (a: OutboxEntry, b: OutboxEntry) =>
  a.enqueuedAt < b.enqueuedAt ? -1 : a.enqueuedAt > b.enqueuedAt ? 1 : 0;

export const makeEntryStore = (args: {
  store: SyncStore;
  syncName: string;
}): EntryStore => {
  const { store, syncName } = args;
  const provide = <A, E>(
    effect: Effect.Effect<A, E, StdTableService<'sync-store'>>,
    operation: 'delete' | 'get' | 'query' | 'transact' | 'update',
  ) =>
    store.provide(effect, {
      collection: syncName,
      operation,
      record: 'outbox',
    });

  const toEntry = (
    stored: StoredOutboxEntryValue,
  ): Effect.Effect<OutboxEntry, WriteError> =>
    decodeEntryBody(stored.body).pipe(
      Effect.map((body): OutboxEntry => ({
        id: stored.key,
        name: stored.name as HandlerName,
        queue: stored.queue as QueueKey,
        status: stored.status,
        enqueuedAt: stored.enqueuedAt,
        body,
      })),
      Effect.mapError((cause): WriteError => ({
        _tag: 'Invalid',
        reason: `Outbox Entry "${stored.key}" has an unreadable body: ${cause.message}`,
      })),
    );

  const key = (id: string) => ({ sync: syncName, key: id });

  type Stored = DecodedEntity<StoredOutboxEntryValue>;

  // Failed Entries are retained, so every scan pages to exhaustion; a bounded
  // first page would hide newer pending Entries behind them forever.
  const entries = (
    query: (
      after: Stored | undefined,
    ) => Effect.Effect<
      { items: ReadonlyArray<Stored>; hasMore: boolean },
      DatabaseError,
      StdTableService<'sync-store'>
    >,
  ): Effect.Effect<OutboxEntry[], WriteError> =>
    Effect.gen(function* () {
      const found: OutboxEntry[] = [];
      let after: Stored | undefined;
      while (true) {
        const page = yield* provide(query(after), 'query').pipe(
          Effect.mapError(storeError('failed to read the Outbox')),
        );
        for (const item of page.items) found.push(yield* toEntry(item.value));
        const last = page.items.at(-1);
        if (!page.hasMore || last === undefined) break;
        after = last;
      }
      return found.sort(byEnqueuedAt);
    });

  const list = () =>
    entries((after) =>
      storedOutboxEntryEntity.query(
        'primary',
        { pk: { sync: syncName }, '>=': null },
        after === undefined ? {} : { after },
      ),
    );

  const queues = (): Effect.Effect<Set<QueueKey>, WriteError> =>
    Effect.gen(function* () {
      const found = new Set<QueueKey>();
      let after: Stored | undefined;
      while (true) {
        const page = yield* provide(
          storedOutboxEntryEntity.query(
            'primary',
            { pk: { sync: syncName }, '>=': null },
            after === undefined ? {} : { after },
          ),
          'query',
        ).pipe(Effect.mapError(storeError('failed to read the Outbox')));
        for (const item of page.items) {
          if (item.value.status !== 'failed') {
            found.add(item.value.queue as QueueKey);
          }
        }
        const last = page.items.at(-1);
        if (!page.hasMore || last === undefined) break;
        after = last;
      }
      return found;
    });

  const setStatus = (ids: ReadonlyArray<string>, status: OutboxStatus) =>
    Effect.forEach(
      ids,
      (id) =>
        provide(
          storedOutboxEntryEntity.getAndUpdate(
            key(id),
            { status },
            { lastWriteWins: true },
          ),
          'update',
        ),
      { discard: true },
    ).pipe(Effect.mapError(storeError('failed to update the Outbox')));

  const remove = (ids: ReadonlyArray<string>) =>
    Effect.forEach(
      ids,
      (id) =>
        provide(
          storedOutboxEntryEntity.hardDelete(key(id), 'I KNOW WHAT I AM DOING'),
          'delete',
        ).pipe(
          Effect.catch((error) =>
            error.reason._tag === 'EntityNotFound'
              ? Effect.void
              : Effect.fail(error),
          ),
        ),
      { discard: true },
    ).pipe(Effect.mapError(storeError('failed to delete from the Outbox')));

  return {
    enqueue: (batch) =>
      batch.length === 0
        ? Effect.void
        : provide(
            Effect.gen(function* () {
              const ops = yield* Effect.forEach(batch, (entry) =>
                storedOutboxEntryEntity.insertOp({
                  sync: syncName,
                  key: entry.id,
                  name: entry.name,
                  queue: entry.queue,
                  status: 'pending',
                  enqueuedAt: entry.enqueuedAt,
                  body: entry.body,
                }),
              );
              yield* syncStore.transact(ops);
            }),
            'transact',
          ).pipe(
            Effect.asVoid,
            Effect.mapError(storeError('failed to write the Outbox')),
          ),
    byId: (id) =>
      provide(storedOutboxEntryEntity.get(key(id)), 'get').pipe(
        Effect.mapError(storeError('failed to read the Outbox')),
        Effect.flatMap((stored) =>
          stored === null ? Effect.succeed(null) : toEntry(stored.value),
        ),
      ),
    list,
    queues,
    queue: (queue) =>
      entries((after) =>
        storedOutboxEntryEntity.query(
          'byQueue',
          { pk: { sync: syncName }, '=': { queue } },
          after === undefined ? {} : { after },
        ),
      ),
    setStatus,
    remove,
    resetInFlight: () =>
      list().pipe(
        Effect.flatMap((found) =>
          setStatus(
            found
              .filter((entry) => entry.status === 'in-flight')
              .map((entry) => entry.id),
            'pending',
          ),
        ),
      ),
  };
};
