import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { MetaSchema } from '../../../core/index.js';
import { EntityESchema, fromType } from '../../../eschema/index.js';
import { StdTable, type StdTableService } from '../../../db/index.js';

const TABLE_NAME = 'sync-persistence';
type OpaqueValue = {} | null;

const storedSourceSchema = EntityESchema.make(
  'TanStackSyncStoredSource',
  'key',
  {
    collection: Schema.String,
    seq: Schema.String,
    value: fromType<OpaqueValue>(),
    meta: MetaSchema,
  },
).build();

const storedSyncStateSchema = EntityESchema.make(
  'TanStackSyncStoredState',
  'key',
  {
    collection: Schema.String,
    strategy: Schema.String,
    value: fromType<OpaqueValue>(),
  },
).build();

const storedSourceCursorSchema = EntityESchema.make(
  'TanStackSyncStoredSourceCursor',
  'key',
  {
    collection: Schema.String,
    position: Schema.String,
  },
).build();

export const syncPersistenceTable = StdTable.make(TABLE_NAME)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

export const storedSourceEntity = syncPersistenceTable
  .entity(storedSourceSchema)
  .primary({ pk: ['collection'] })
  .index('LSI1', 'bySequence', { sk: ['seq'] })
  .build();

export const storedSourceCursorEntity = syncPersistenceTable
  .entity(storedSourceCursorSchema)
  .primary({ pk: ['collection'] })
  .build();

export const storedSyncStateEntity = syncPersistenceTable
  .entity(storedSyncStateSchema)
  .primary({ pk: ['collection'] })
  .build();

export type StoredSourceValue = typeof storedSourceSchema.Type;
export type StoredSourceCursorValue = typeof storedSourceCursorSchema.Type;
export type StoredSyncStateValue = typeof storedSyncStateSchema.Type;
export type SyncPersistenceLayer = Layer.Layer<
  StdTableService<typeof TABLE_NAME>
>;

export type SyncPersistence = {
  provide: <A, E>(
    effect: Effect.Effect<A, E, StdTableService<typeof TABLE_NAME>>,
    details: {
      readonly collection: string;
      readonly operation: 'get' | 'insert' | 'query' | 'transact' | 'update';
      readonly record: 'source-of-truth' | 'sync-state';
      readonly strategy?: string;
    },
  ) => Effect.Effect<A, E>;
  dispose: () => Promise<void>;
};

export const makeSyncPersistence = (
  layer: SyncPersistenceLayer,
): SyncPersistence => {
  const runtime = ManagedRuntime.make(layer);
  return {
    provide: (effect, details) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) => Effect.provide(effect, context)),
        Effect.withSpan('sync.persistence', {
          kind: 'client',
          attributes: {
            'db.system.name': 'std-table',
            'db.namespace': TABLE_NAME,
            'db.operation.name': details.operation,
            'sync.collection': details.collection,
            'sync.persistence.record': details.record,
            ...(details.strategy === undefined
              ? {}
              : { 'sync.strategy': details.strategy }),
          },
        }),
      ),
    dispose: () => runtime.dispose(),
  };
};
