import {
  CollectionConfig,
  createCollection,
  SyncConfig,
} from '@tanstack/react-db';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Effect, Fiber, Ref } from 'effect';
import { Source } from './source/source.js';
import { MemorySource } from './source/memory.js';
import { OptimisticEntry, SmartOptimistic } from './smart-optimistic.js';
import { BulkOp } from './types.js';
import { EmptyStdESchema } from '@std-toolkit/eschema/eschema-std.js';
import {
  broadcastSchema,
  BroadcastSchemaType,
  metaSchema,
} from '@std-toolkit/core/schema.js';

export interface StdCollectionType
  extends ReturnType<typeof createStdCollectionRaw<any, any>> {}

export const createStdCollectionRaw = <
  TSchema extends StandardSchemaV1<any>,
  TKey extends keyof StandardSchemaV1.InferOutput<TSchema>,
  TSyncType = StandardSchemaV1.InferOutput<TSchema>,
>({
  name,
  keyConfig,
  onInsert,
  onUpdate,
  compare,
  syncConfig,
  source = new MemorySource(),
}: {
  name: string;
  source?: Source<StandardSchemaV1.InferOutput<TSchema>>;
  schema: TSchema;
  keyConfig: {
    deps: TKey[];
    encode: (
      value: Pick<StandardSchemaV1.InferOutput<TSchema>, TKey>,
    ) => string;
  };
  compare: (
    a: StandardSchemaV1.InferOutput<TSchema>,
    b: StandardSchemaV1.InferOutput<TSchema>,
  ) => number;
  onInsert?: (
    value: StandardSchemaV1.InferOutput<TSchema>,
  ) => Effect.Effect<StandardSchemaV1.InferOutput<TSchema>>;
  onUpdate?: (
    key: Pick<StandardSchemaV1.InferOutput<TSchema>, TKey>,
    value: Partial<Omit<StandardSchemaV1.InferOutput<TSchema>, TKey>>,
  ) => Effect.Effect<Partial<StandardSchemaV1.InferOutput<TSchema>>>;
  syncConfig:
    | {
        type: 'api';
        fn: (
          after?: TSyncType | null,
        ) => Effect.Effect<StandardSchemaV1.InferOutput<TSchema>[]>;
      }
    | {
        type: 'realtime';
        subscribe: (
          after: Ref.Ref<TSyncType | null>,
        ) => Effect.Effect<(() => void) | void>;
      };
}) => {
  type Type = StandardSchemaV1.InferOutput<TSchema>;
  let syncVars: {
    current:
      | Parameters<
          SyncConfig<StandardSchemaV1.InferOutput<TSchema>, string>['sync']
        >[0]
      | null;
    latest: Ref.Ref<StandardSchemaV1.InferOutput<TSchema> | null>;
    retrigger?: () => void;
  } = { current: null, latest: Ref.unsafeMake(null) };

  const localInsert = (
    values: StandardSchemaV1.InferOutput<TSchema>[],
    persist = false,
  ) => {
    if (!syncVars.current || values.length === 0) return;
    const { begin, write, commit } = syncVars.current;

    begin();
    try {
      values.forEach((v) => {
        write({ type: 'insert', value: v });
        if (persist) {
          source.set(keyConfig.encode(v), v);
        }
      });
    } finally {
      commit();
    }
  };
  const localUpdate = (values: Partial<Type>[], persist = false) => {
    if (!syncVars.current) return;
    const { begin, write, commit } = syncVars.current;

    try {
      begin();
      values.forEach((v) => {
        write({ type: 'update', value: v as any });
        if (persist) {
          source.set(keyConfig.encode(v as any), v);
        }
      });
    } finally {
      commit();
    }
  };
  const localUpsert = (values: readonly Type[], persist = false) => {
    if (!syncVars.current) return;
    const { collection, begin, write, commit } = syncVars.current;

    begin();
    try {
      values.forEach((v) => {
        const key = keyConfig.encode(v);
        if (collection.has(key)) {
          write({ type: 'update', value: v });
        } else {
          write({ type: 'insert', value: v });
        }
        if (persist) {
          source.set(key, v);
        }
      });
    } finally {
      commit();
    }
  };
  const localBulkOperation = (values: BulkOp[]) => {
    if (!syncVars.current || values.length === 0) return;
    const { collection, begin, write, commit } = syncVars.current;

    begin();

    values.forEach((obj) => {
      if (obj.type === 'upsert') {
        const { value } = obj;
        const key = keyConfig.encode(value);
        if (collection.has(key)) {
          write({ type: 'update', value: value });
        } else {
          write({ type: 'insert', value: value });
        }
      } else if (obj.type === 'deleteKey') {
        const value = collection.get(obj.key);
        if (value) {
          write({ type: 'delete', value });
        }
      } else {
        const { type, value } = obj;
        write({ type, value });
      }
    });

    commit();
  };

  const apiSync = Effect.fn(function* () {
    if (syncConfig.type !== 'api') {
      return yield* Effect.dieMessage('This is an api syncConfig');
    }

    while (true) {
      const ops: BulkOp[] = [];
      const results = (yield* syncConfig.fn(
        Effect.runSync(Ref.get(syncVars.latest)),
      )).toSorted(compare);
      if (results.length === 0) {
        return;
      }
      for (const v of results) {
        yield* Effect.promise(() => source.set(keyConfig.encode(v), v));
        ops.push(...(yield* smartOptimistic.clearTmpItem(v)));
      }
      localBulkOperation(ops);
      if (JSON.stringify(results.at(-1)) === JSON.stringify(syncVars.latest)) {
        console.error('BREAKING OUT OF SYNC LOOP TO AVOID INFINITE LOOP', {
          syncVars,
          results,
        });
        break;
      }
      yield* Ref.set(syncVars.latest, results.at(-1));
    }
    return () => {};
  });

  type CollectionType = TSyncType & {
    _optimisticState?: OptimisticEntry<Type, TKey>;
  };
  const tanstackCollection = createCollection({
    getKey: keyConfig.encode,
    gcTime: 3000,
    sync: {
      sync(params) {
        const fiber = Effect.runFork(
          Effect.gen(function* () {
            syncVars.current = params;
            // Sync from source first.
            const allRecords = (yield* Effect.promise(() =>
              source.getAll(),
            )).sort(compare);
            localInsert(allRecords);
            params.markReady();
            Effect.runSync(
              Ref.set(
                syncVars.latest,
                allRecords[allRecords.length - 1] ?? null,
              ),
            );

            if (syncConfig.type === 'realtime') {
              yield* syncConfig.subscribe(syncVars.latest);
            }
          }),
        );

        return () => {
          console.log('unsubscribing....');
          Effect.runFork(Fiber.interrupt(fiber));
        };
      },
    },
  } as CollectionConfig<CollectionType, string, never>);

  // tanstackCollection.on('subscribers:change', (v) =>
  //   console.log('SUBSCRIPTIONS CHANGE: ', v),
  // );

  const smartOptimistic = new SmartOptimistic({
    keyConfig,
    source,
    tanstackCollection: {
      get: tanstackCollection.get.bind(tanstackCollection),
      localBulkOperation,
    },
    onChanges: () => syncVars.retrigger?.(),
    onInsert,
    onUpdate,
  });

  return {
    name,
    Type: null as Type,
    TypeWithOptimistic: null as any as CollectionType,
    collection: tanstackCollection,
    syncVars,
    insert: (value: Type) => smartOptimistic.insert(value),
    update: (key: Pick<Type, TKey>, value: Partial<Omit<Type, TKey>>) =>
      smartOptimistic.update(key, value),
    localBulkOperation,
    localInsert: (value: Type, persist = false) =>
      localInsert([value], persist),
    localUpdate: (value: Partial<Type>, persist = false) =>
      localUpdate([value], persist),
    localUpsert: (value: Type, persist = false) =>
      localUpsert([value], persist),
    getOptimisticState:
      smartOptimistic.getOptimisticState.bind(smartOptimistic),
    apiSync,
  };
};

export const createStdCollection = <TSchema extends EmptyStdESchema>({
  schema,
  onInsert,
  onUpdate,
  sync,
  source = new MemorySource(),
}: {
  source?: Source<StandardSchemaV1.InferOutput<TSchema>>;
  schema: TSchema;
  onInsert: (
    value: TSchema['Type'],
  ) => Effect.Effect<BroadcastSchemaType<TSchema['Type']>>;
  onUpdate: (
    key: Pick<TSchema['Type'], TSchema['KeyType']>,
    value: Partial<TSchema['Type']>,
  ) => Effect.Effect<BroadcastSchemaType<Partial<TSchema['Type']>>>;
  sync: (
    after: Ref.Ref<(TSchema['Type'] & typeof metaSchema.Type) | null>,
  ) => Effect.Effect<void | (() => void)>;
}) => {
  const collection = createStdCollectionRaw<
    TSchema,
    TSchema['KeyType'],
    TSchema['Type'] & typeof metaSchema.Type
  >({
    schema,
    name: schema.name,
    keyConfig: schema.keyDef,
    syncConfig: {
      type: 'realtime',
      subscribe: sync,
    },
    onInsert: (value) =>
      onInsert(value).pipe(Effect.map((v) => ({ ...v.value, ...v.meta }))),
    onUpdate: (key, value) =>
      onUpdate(key, value).pipe(Effect.map((v) => ({ ...v.value, ...v.meta }))),
    source,
    compare: (a, b) => (a._u < b._u ? -1 : 1),
  });
  return {
    broadcast({ meta, value }: typeof broadcastSchema.Type, persist = false) {
      collection.localUpsert({ ...value, ...meta }, persist);
    },
    ...collection,
  };
};
