import { EmptyESchema } from '@std-toolkit/eschema';
import {
  CollectionConfig,
  createCollection,
  SyncConfig,
} from '@tanstack/react-db';
import { Duration, Effect } from 'effect';
import { Source } from './source/source.js';
import { MemorySource } from './source/memory.js';
import { OptimisticEntry, SmartOptimistic } from './smart-optimistic.js';
import { BulkOp } from './types.js';
import { periodicSync } from './utils.js';

export const createStdCollection = <
  TSchema extends EmptyESchema,
  TKey extends keyof TSchema['Type'],
>({
  // eschema,
  keyConfig,
  onInsert,
  onUpdate,
  compare,
  getUpdates,
  source = new MemorySource(),
}: {
  source?: Source<TSchema['Type']>;
  eschema: TSchema;
  keyConfig: {
    deps: TKey[];
    encode: (value: Pick<TSchema['Type'], TKey>) => string;
    decode: (value: string) => Pick<TSchema['Type'], TKey>;
  };
  onInsert?: (value: TSchema['Type']) => Effect.Effect<TSchema['Type']>;
  onUpdate?: (
    key: Pick<TSchema['Type'], TKey>,
    value: Partial<Omit<TSchema['Type'], TKey>>,
  ) => Effect.Effect<Partial<TSchema['Type']>>;
  compare: (a: TSchema['Type'], b: TSchema['Type']) => number;
  getUpdates?: (
    after?: TSchema['Type'] | null,
  ) => Effect.Effect<readonly TSchema['Type'][]>;
}) => {
  let syncVars: {
    current: Parameters<SyncConfig<TSchema['Type'], string>['sync']>[0] | null;
    latest: TSchema['Type'] | null;
    retrigger?: () => void;
  } = { current: null, latest: null };

  const localInsert = (values: TSchema['Type'][]) => {
    if (!syncVars.current || values.length === 0) return;
    const { begin, write, commit } = syncVars.current;

    begin();
    try {
      values.forEach((v) => {
        write({ type: 'insert', value: v });
      });
    } finally {
      commit();
    }
  };
  const localUpdate = (values: Partial<TSchema['Type']>[]) => {
    if (!syncVars.current) return;
    const { begin, write, commit } = syncVars.current;

    try {
      begin();
      values.forEach((v) => {
        write({ type: 'update', value: v });
      });
    } finally {
      commit();
    }
  };
  const localUpsert = (values: readonly TSchema['Type'][]) => {
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

  function sync() {
    return Effect.runPromise(
      Effect.gen(function* () {
        const ops: BulkOp[] = [];
        if (getUpdates) {
          const results = (yield* getUpdates(syncVars.latest)).toSorted(
            compare,
          );
          if (results[results.length - 1]) {
            syncVars.latest = results[results.length - 1];
          }
          for (const v of results) {
            yield* Effect.promise(() => source.set(keyConfig.encode(v), v));
            ops.push(
              ...(yield* smartOptimistic.clearTmpItem(keyConfig.encode(v))),
            );
          }
        }
        localBulkOperation(ops);
      }),
    );
  }

  type CollectionType = TSchema['Type'] & {
    _optimisticState?: OptimisticEntry<TSchema['Type'], TKey>;
  };
  const tanstackCollection = createCollection({
    getKey: keyConfig.encode,
    sync: {
      async sync(params) {
        syncVars.current = params;
        // Sync from source first.
        const allRecords = (await source.getAll()).sort(compare);
        localInsert(allRecords);
        params.markReady();
        syncVars.latest = allRecords[allRecords.length - 1] ?? null;

        // FIX: Dirty periodic sync logic for now.
        const result = await Effect.runPromise(
          periodicSync(
            Effect.promise(async () => {
              await sync();
            }),
            Duration.seconds(2),
            Duration.seconds(5),
          ),
        );
        syncVars.retrigger = () => Effect.runPromise(result.retrigger);

        return () => {
          // cleanup goes here again...
        };
      },
    },
  } as CollectionConfig<CollectionType, string, never>);

  const smartOptimistic = new SmartOptimistic({
    keyConfig: keyConfig as any,
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
    Type: null as TSchema['Type'],
    TypeWithOptimistic: null as CollectionType,
    collection: tanstackCollection,
    insert: (value: TSchema['Type']) => smartOptimistic.insert(value),
    update: (
      key: Pick<TSchema['Type'], TKey>,
      value: Partial<Omit<TSchema['Type'], TKey>>,
    ) => smartOptimistic.update(key, value),
    localBulkOperation,
    localInsert: (value: TSchema['Type']) => localInsert([value]),
    localUpdate: (value: Partial<TSchema['Type']>) => localUpdate([value]),
    localUpsert: (value: TSchema['Type']) => localUpsert([value]),
    getOptimisticState:
      smartOptimistic.getOptimisticState.bind(smartOptimistic),
    sync,
  };
};
