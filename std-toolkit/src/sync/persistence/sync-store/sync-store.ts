import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { MetaSchema } from '../../../core/index.js';
import { EntityESchema, fromType } from '../../../eschema/index.js';
import { StdTable, type StdTableService } from '../../../db/index.js';

const TABLE_NAME = 'sync-store';
type OpaqueValue = {} | null;

const storedReplicaSchema = EntityESchema.make('SyncStoredReplica', 'key', {
  collection: Schema.String,
  seq: Schema.String,
  value: fromType<OpaqueValue>(),
  meta: MetaSchema,
}).build();

const storedSyncStateSchema = EntityESchema.make('SyncStoredState', 'key', {
  collection: Schema.String,
  strategy: Schema.String,
  value: fromType<OpaqueValue>(),
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

export const makeSyncStore = (layer: SyncStoreLayer): SyncStore => {
  const runtime = ManagedRuntime.make(layer);
  return {
    provide: (effect, details) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) => Effect.provide(effect, context)),
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
