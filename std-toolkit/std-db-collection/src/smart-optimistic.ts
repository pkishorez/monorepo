import { Effect } from 'effect';
import { Source } from './source/source.js';
import { ulid } from 'ulid';
import { BulkOp } from './types.js';

export class SmartOptimistic<TValue, TKey extends keyof TValue> {
  private syncSource: Source<TValue>;
  private tmpSource: Map<string, Partial<TValue>> = new Map();

  private keyConfig: {
    encode: (value: Pick<TValue, TKey>) => string;
    decode: (key: string) => Pick<TValue, TKey>;
  };
  private onInsert?: ((value: TValue) => Effect.Effect<TValue>) | undefined;
  private onUpdate?:
    | ((
        key: Pick<TValue, TKey>,
        value: Partial<Omit<TValue, TKey>>,
      ) => Effect.Effect<Partial<TValue>>)
    | undefined;

  private tanstackCollection: {
    localBulkOperation: (value: BulkOp[]) => void;
    get: (key: string) => TValue | undefined;
  };
  private optimisticEntries: Map<
    string,
    {
      updateInProgress: string[];
      insertionInProgress: boolean;
      updates: {
        id: string;
        type: 'update';
        key: Pick<TValue, TKey>;
        value: Partial<Omit<TValue, TKey>>;
        kind: 'transaction' | 'smart';
      }[];
    }
  > = new Map();

  constructor({
    onInsert,
    onUpdate,
    tanstackCollection,
    source,
    keyConfig,
  }: {
    onInsert?: ((value: TValue) => Effect.Effect<TValue>) | undefined;
    onUpdate?:
      | ((
          key: Pick<TValue, TKey>,
          value: Partial<Omit<TValue, TKey>>,
        ) => Effect.Effect<Partial<TValue>>)
      | undefined;
    tanstackCollection: {
      localBulkOperation: (value: BulkOp[]) => void;
      get: (key: string) => TValue | undefined;
    };
    source: Source<TValue>;
    keyConfig: {
      encode: (value: Pick<TValue, TKey>) => string;
      decode: (key: string) => Pick<TValue, TKey>;
    };
  }) {
    this.onInsert = onInsert;
    this.onUpdate = onUpdate;
    this.tanstackCollection = tanstackCollection;
    this.syncSource = source;
    this.keyConfig = keyConfig;
  }

  #getOptimisticEntry(key: string) {
    if (!this.optimisticEntries.has(key)) {
      this.optimisticEntries.set(key, {
        insertionInProgress: false,
        updateInProgress: [],
        updates: [],
      });
    }

    return this.optimisticEntries.get(key)!;
  }
  #updateOptimisticEntry(
    key: string,
    fn: (draft: {
      updateInProgress: string[];
      insertionInProgress: boolean;
      updates: {
        id: string;
        type: 'update';
        key: Pick<TValue, TKey>;
        value: Partial<Omit<TValue, TKey>>;
        kind: 'transaction' | 'smart';
      }[];
    }) => void,
  ) {
    const item = this.#getOptimisticEntry(key);
    fn(item);
  }

  insert = Effect.fn(function* (
    this: SmartOptimistic<TValue, TKey>,
    value: TValue,
  ) {
    const key = this.keyConfig.encode(value);
    if (
      (yield* Effect.promise(() => this.syncSource.get(key))) ||
      this.tmpSource.get(key)
    ) {
      throw new Error('Item already exists.');
    }
    this.#updateOptimisticEntry(key, (v) => {
      v.insertionInProgress = true;
    });
    this.tmpSource.set(key, value);
    this.tanstackCollection.localBulkOperation(
      yield* this.#getSyncKeyOperation(key),
    );
    const ops: BulkOp[] = [];

    if (this.onInsert) {
      yield* this.onInsert(value).pipe(
        Effect.tap((result) =>
          Effect.gen(this, function* () {
            const updatedKey = this.keyConfig.encode(result);
            if (key !== updatedKey) {
              ops.push({ type: 'deleteKey', key });

              // Move all optimistic updates from old to new.
              this.#updateOptimisticEntry(updatedKey, (v) => {
                v.updates = this.#getOptimisticEntry(key).updates.map((v) => ({
                  ...v,
                  key: this.keyConfig.decode(updatedKey),
                }));
              });
              this.optimisticEntries.delete(key);
            } else {
              this.#updateOptimisticEntry(key, (v) => {
                v.insertionInProgress = false;
              });
            }

            this.tmpSource.set(updatedKey, {
              ...this.tmpSource.get(updatedKey),
              ...value,
            });
            ops.push(...(yield* this.#getSyncKeyOperation(updatedKey)));
            yield* this.queueUpdate(updatedKey);
          }),
        ),
        Effect.onError(() =>
          Effect.gen(this, function* () {
            this.tmpSource.delete(key);
            ops.push({ type: 'deleteKey', key });
            ops.push(...(yield* this.#getSyncKeyOperation(key)));
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            this.#updateOptimisticEntry(key, (v) => {
              v.insertionInProgress = false;
            });
          }),
        ),
      );
    } else {
      ops.push(...(yield* this.#getSyncKeyOperation(key)));
    }
    this.tanstackCollection.localBulkOperation(ops);
  });

  update = Effect.fn(function* (
    this: SmartOptimistic<TValue, TKey>,
    keyObj: Pick<TValue, TKey>,
    value: Partial<Omit<TValue, TKey>>,
  ) {
    const key = this.keyConfig.encode(keyObj);
    if (!this.tanstackCollection.get(key)) {
      return yield* Effect.dieMessage(`Item do not exist to update ${key}`);
    }

    this.#updateOptimisticEntry(key, (v) => {
      v.updates = [
        ...v.updates,
        { id: ulid(), type: 'update', key: keyObj, value, kind: 'smart' },
      ];
    });
    this.tanstackCollection.localBulkOperation(
      yield* this.#getSyncKeyOperation(key),
    );
    yield* this.queueUpdate(key);
  });

  clearTmpItem = (key: string) =>
    Effect.gen(this, function* () {
      this.tmpSource.delete(key);
      return yield* this.#getSyncKeyOperation(key);
    });

  private queueUpdate = (key: string): Effect.Effect<void> => {
    return Effect.gen(this, function* () {
      const optimisticEntry = this.#getOptimisticEntry(key);
      if (
        optimisticEntry.insertionInProgress ||
        optimisticEntry.updateInProgress.length > 0 ||
        !this.onUpdate
      ) {
        return;
      }
      const currentUpdateBatch = optimisticEntry.updates.filter(
        (v) => v.kind === 'smart',
      );
      const [first, ...rest] = currentUpdateBatch;
      if (!first) {
        return;
      }
      optimisticEntry.updateInProgress = currentUpdateBatch.map((v) => v.id);
      optimisticEntry.updates = optimisticEntry.updates.filter(
        (v) => v.kind !== 'smart',
      );

      const value = rest.reduce(
        (acc, v) => ({ ...acc, ...v.value }),
        first.value,
      );
      this.tmpSource.set(key, { ...this.tmpSource.get(key), ...value } as any);
      this.tanstackCollection.localBulkOperation(
        yield* this.#getSyncKeyOperation(key),
      );
      yield* this.onUpdate(this.keyConfig.decode(key), value).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            this.tmpSource.set(key, { ...this.tmpSource.get(key), ...result });
          }),
        ),
        Effect.onExit(() =>
          Effect.gen(this, function* () {
            this.#updateOptimisticEntry(key, (draft) => {
              draft.updates = draft.updates.filter(
                (update) =>
                  !currentUpdateBatch.map((v) => v.id).includes(update.id),
              );
              draft.updateInProgress = [];
            });
            this.tanstackCollection.localBulkOperation(
              yield* this.#getSyncKeyOperation(key),
            );
            yield* Effect.suspend(() => this.queueUpdate(key));
          }),
        ),
      );
    });
  };

  getOptimisticState(key: string) {
    return this.#getOptimisticEntry(key);
  }

  #getSyncKeyOperation = Effect.fn(function* (
    this: SmartOptimistic<TValue, TKey>,
    key: string,
  ) {
    const value = yield* Effect.promise(() => this.syncSource.get(key));
    const tmpValue = this.tmpSource.get(key);
    if (!value && !tmpValue) {
      console.error('No value with key present to sync', key);
      return [];
    }
    const initialValue = { ...value, ...tmpValue } as TValue;
    const optimisticEntries = this.#getOptimisticEntry(key);
    const optimisticUpdate = optimisticEntries.updates.reduce(
      (acc, v) => ({ ...acc, ...v.value }),
      initialValue,
    );

    return [
      {
        type: 'upsert',
        value: {
          ...optimisticUpdate,
          _optimisticState: structuredClone(optimisticEntries),
        },
      },
    ] as BulkOp[];
  });
}
