import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { EntityESchema, fromType } from '../../../eschema/index.js';
import { StdTable, type StdTableService } from '../../../db/index.js';

const TABLE_NAME = 'sync-store';
type OpaqueValue = {} | null;

const storedReplicaSchema = EntityESchema.make('SyncStoredReplica', 'key', {
  collection: Schema.String,
  seq: Schema.String,
  entity: fromType<OpaqueValue>(),
}).build();

const storedSyncStateSchema = EntityESchema.make('SyncStoredState', 'key', {
  collection: Schema.String,
  strategy: Schema.String,
  value: fromType<OpaqueValue>(),
}).build();

const storedVersionSchema = EntityESchema.make('SyncStoredVersion', 'key', {
  collection: Schema.String,
  version: Schema.String,
}).build();

const storedReplicaCursorSchema = EntityESchema.make(
  'SyncStoredReplicaCursor',
  'key',
  {
    collection: Schema.String,
    position: Schema.String,
  },
).build();

export const syncStore = StdTable.make(TABLE_NAME)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

export const storedReplicaEntity = syncStore
  .entity(storedReplicaSchema)
  .primary({ pk: ['collection'] })
  .index('LSI1', 'bySequence', { sk: ['seq'] })
  .build();

export const storedReplicaCursorEntity = syncStore
  .entity(storedReplicaCursorSchema)
  .primary({ pk: ['collection'] })
  .build();

export const storedSyncStateEntity = syncStore
  .entity(storedSyncStateSchema)
  .primary({ pk: ['collection'] })
  .build();

export const storedVersionEntity = syncStore
  .entity(storedVersionSchema)
  .primary({ pk: ['collection'] })
  .build();

export type StoredReplicaValue = typeof storedReplicaSchema.Type;
export type StoredSyncStateValue = typeof storedSyncStateSchema.Type;
export type SyncStoreLayer = Layer.Layer<StdTableService<typeof TABLE_NAME>>;

export type SyncStore = {
  provide: <A, E>(
    effect: Effect.Effect<A, E, StdTableService<typeof TABLE_NAME>>,
    details: {
      readonly collection: string;
      readonly operation: 'get' | 'insert' | 'query' | 'transact' | 'update';
      readonly record: 'sync-replica' | 'sync-state';
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

const makeVersionGate = (
  versioning: SyncStoreVersion,
): Effect.Effect<void, unknown, StdTableService<typeof TABLE_NAME>> =>
  Effect.gen(function* () {
    const key = { collection: versioning.name, key: VERSION_KEY };
    const stored = yield* storedVersionEntity.get(key);
    if (stored?.value.version === versioning.version) return;
    yield* Effect.logWarning(
      `[sync] "${versioning.name}" moved from version "${stored?.value.version ?? 'none'}" to "${versioning.version}"; clearing the Sync Store`,
    );
    yield* syncStore.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING');
    yield* storedVersionEntity.insert({ ...key, version: versioning.version });
  }).pipe(Effect.cached, Effect.runSync);

export const makeSyncStore = (
  layer: SyncStoreLayer,
  versioning?: SyncStoreVersion,
): SyncStore => {
  const runtime = ManagedRuntime.make(layer);
  const gate = versioning ? Effect.orDie(makeVersionGate(versioning)) : null;
  return {
    provide: (effect, details) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) =>
          Effect.provide(gate ? Effect.andThen(gate, effect) : effect, context),
        ),
        Effect.withSpan('sync.sync-store', {
          kind: 'client',
          attributes: {
            'db.system.name': 'std-table',
            'db.namespace': TABLE_NAME,
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
