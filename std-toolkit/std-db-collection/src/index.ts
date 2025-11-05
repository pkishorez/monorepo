import { EmptyESchema } from '@std-toolkit/eschema';
import {
  CollectionConfig,
  createCollection,
  SyncConfig,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import { Source } from './source/source.js';
import { MemorySource } from './source/memory.js';
import { SmartOptimistic } from './smart-optimistic.js';
import { BulkOp } from './types.js';

export const createStdCollection = <
  TSchema extends EmptyESchema,
  TKey extends keyof TSchema['Type'],
>({
  // eschema,
  keyConfig,
  onInsert,
  onUpdate,
  // compare,
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
  compare?: (a: TSchema['Type'], b: TSchema['Type']) => number;
  getUpdates?: (
    after?: TSchema['Type'],
  ) => Effect.Effect<readonly TSchema['Type'][]>;
}) => {
  let syncParams: {
    current: Parameters<SyncConfig<TSchema['Type'], string>['sync']>[0] | null;
  } = { current: null };

  const localInsert = (values: TSchema['Type'][]) => {
    if (!syncParams.current) return;
    const { begin, write, commit } = syncParams.current;

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
    if (!syncParams.current) return;
    const { begin, write, commit } = syncParams.current;

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
    if (!syncParams.current) return;
    const { collection, begin, write, commit } = syncParams.current;

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
    if (!syncParams.current || values.length === 0) return;
    const { collection, begin, write, commit } = syncParams.current;

    begin();

    console.trace('BULK UPSERT: ', values);
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
        if (getUpdates) {
          const results = yield* getUpdates();
          const ops: BulkOp[] = [];
          for (const v of results) {
            source.set(keyConfig.encode(v), v);
            ops.push(
              ...(yield* smartOptimistic.clearTmpItem(keyConfig.encode(v))),
            );
          }
          localBulkOperation(ops);
        }
      }),
    );
  }

  const tanstackCollection = createCollection({
    getKey: keyConfig.encode,
    sync: {
      async sync(params) {
        console.debug('Sync starting up...');
        syncParams.current = params;
        try {
          await sync();
        } finally {
          params.markReady();
        }
        console.log('Sync completed...');

        return () => {
          // cleanup goes here again...
          console.debug('Sync cleaning up...');
        };
      },
    },
  } as CollectionConfig<
    TSchema['schema']['Type'] & { isOptimistic: boolean },
    string,
    never
  >);

  const smartOptimistic = new SmartOptimistic({
    keyConfig: keyConfig as any,
    source,
    tanstackCollection: {
      get: tanstackCollection.get.bind(tanstackCollection),
      localBulkOperation,
    },
    onInsert,
    onUpdate,
  });

  return {
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
    sync,
  };
};
