import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import type { StdTableService } from '../../../db/index.js';
import {
  SYNC_STORE_TABLE,
  storedOutboxEntryEntity,
  storedReplicaCursorEntity,
  storedReplicaEntity,
  storedSyncStateEntity,
  storedVersionEntity,
} from '../../domain/stored-entity/index.js';

export type SyncStoreLayer = Layer.Layer<
  StdTableService<typeof SYNC_STORE_TABLE>
>;

export type SyncStore = {
  wipe: () => Effect.Effect<void, unknown>;
  provide: <A, E>(
    effect: Effect.Effect<A, E, StdTableService<typeof SYNC_STORE_TABLE>>,
    details: {
      readonly collection: string;
      readonly operation:
        | 'delete'
        | 'get'
        | 'insert'
        | 'query'
        | 'transact'
        | 'update';
      readonly record: 'outbox' | 'sync-replica' | 'sync-state';
      readonly strategy?: string;
    },
  ) => Effect.Effect<A, E>;
  dispose: () => Promise<void>;
};

export type SyncStoreVersion = {
  readonly name: string;
  readonly version: string;
};

const VERSION_KEY = 'version';

// Version records of every Sync survive the clear; otherwise two Syncs
// sharing one store would keep wiping each other on every boot.
const wipeRecords = Effect.all(
  [
    storedReplicaEntity.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING'),
    storedReplicaCursorEntity.dangerouslyRemoveAllItems(
      'I KNOW WHAT I AM DOING',
    ),
    storedSyncStateEntity.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING'),
    storedOutboxEntryEntity.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING'),
  ],
  { discard: true },
);

const makeVersionGate = (
  versioning: SyncStoreVersion,
): Effect.Effect<void, unknown, StdTableService<typeof SYNC_STORE_TABLE>> =>
  Effect.gen(function* () {
    const key = { collection: versioning.name, key: VERSION_KEY };
    const stored = yield* storedVersionEntity.get(key);
    if (stored?.value.version === versioning.version) return;
    yield* Effect.logWarning(
      `[sync] "${versioning.name}" moved from version "${stored?.value.version ?? 'none'}" to "${versioning.version}"; clearing the Sync Store`,
    );
    yield* wipeRecords;
    yield* stored === null
      ? storedVersionEntity.insert({ ...key, version: versioning.version })
      : storedVersionEntity.getAndUpdate(key, { version: versioning.version });
  }).pipe(Effect.cached, Effect.runSync);

const isRowArray = Schema.is(Schema.Array(Schema.Unknown));
const isPage = Schema.is(
  Schema.Struct({ items: Schema.Array(Schema.Unknown) }),
);

const returnedRows = (value: unknown): number | null =>
  isRowArray(value) ? value.length : isPage(value) ? value.items.length : null;

export const makeSyncStore = (
  layer: SyncStoreLayer,
  versioning?: SyncStoreVersion,
): SyncStore => {
  const runtime = ManagedRuntime.make(layer);
  const gate = versioning ? Effect.orDie(makeVersionGate(versioning)) : null;
  return {
    wipe: () =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) => Effect.provide(wipeRecords, context)),
        Effect.withSpan('sync.sync-store', {
          kind: 'client',
          attributes: {
            'db.system.name': 'std-table',
            'db.namespace': SYNC_STORE_TABLE,
            'db.operation.name': 'delete',
            'sync.store.record': 'all',
          },
        }),
      ),
    provide: (effect, details) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) =>
          Effect.provide(gate ? Effect.andThen(gate, effect) : effect, context),
        ),
        Effect.tap((value) => {
          const rows = returnedRows(value);
          return rows === null
            ? Effect.void
            : Effect.annotateCurrentSpan('db.response.returned_rows', rows);
        }),
        Effect.withSpan('sync.sync-store', {
          kind: 'client',
          attributes: {
            'db.system.name': 'std-table',
            'db.namespace': SYNC_STORE_TABLE,
            'db.operation.name': details.operation,
            'sync.collection': details.collection,
            'sync.store.record': details.record,
            ...(details.strategy === undefined
              ? {}
              : { 'sync.strategy': details.strategy }),
          },
        }),
      ),
    dispose: () => runtime.dispose(),
  };
};
