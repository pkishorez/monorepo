import { Effect } from 'effect';
import { Source } from './source/source.js';
import { ulid } from 'ulid';
import { BulkOp } from './types.js';

export class SmartOptimistic<T> {
  private syncSource: Source<T>;
  private tmpSource: Map<string, Partial<T>> = new Map();

  private getKey: (key: T) => string;
  private onInsert?: ((value: T) => Effect.Effect<T>) | undefined;
  private onUpdate?:
    | ((value: Partial<T>) => Effect.Effect<Partial<T>>)
    | undefined;

  private tanstackCollection: {
    localBulkOperation: (value: BulkOp[]) => void;
    get: (key: string) => T | undefined;
  };
  private optimisticEntries: Map<
    string,
    {
      executing: boolean;
      updates: {
        id: string;
        type: 'update';
        value: Partial<T>;
        kind: 'transaction' | 'smart';
      }[];
    }
  > = new Map();

  constructor({
    onInsert,
    onUpdate,
    tanstackCollection,
    source,
    getKey,
  }: {
    onInsert?: ((value: T) => Effect.Effect<T>) | undefined;
    onUpdate?: ((value: Partial<T>) => Effect.Effect<Partial<T>>) | undefined;
    tanstackCollection: {
      localBulkOperation: (value: BulkOp[]) => void;
      get: (key: string) => T | undefined;
    };
    source: Source<T>;
    getKey: (key: T) => string;
  }) {
    this.onInsert = onInsert;
    this.onUpdate = onUpdate;
    this.tanstackCollection = tanstackCollection;
    this.syncSource = source;
    this.getKey = getKey;
  }

  insert = Effect.fn(function* (this: SmartOptimistic<T>, value: T) {
    const key = this.getKey(value);
    if (
      (yield* Effect.promise(() => this.syncSource.get(key))) ||
      this.tmpSource.get(key)
    ) {
      throw new Error('Item already exists.');
    }
    this.tmpSource.set(key, value);
    this.tanstackCollection.localBulkOperation(yield* this.syncKey(key));
    const ops: BulkOp[] = [];

    if (this.onInsert) {
      yield* this.onInsert(value).pipe(
        Effect.tap((result) =>
          Effect.gen(this, function* () {
            const updatedKey = this.getKey(result);
            if (key !== updatedKey) {
              ops.push({ type: 'deleteKey', key });
            }

            this.optimisticEntries.set(updatedKey, {
              executing: false,
              ...this.optimisticEntries.get(key),
              updates: this.optimisticEntries.get(key)?.updates ?? [],
            });
            this.tmpSource.set(updatedKey, result);
            ops.push(...(yield* this.syncKey(updatedKey)));
            yield* this.queueUpdate(updatedKey);
            console.log(this.optimisticEntries, {
              tmp: this.tmpSource,
              optimistic: this.optimisticEntries,
              source: this.syncSource,
            });
          }),
        ),
        Effect.onError((err) =>
          Effect.sync(() => {
            console.log('ERROR: ', err);
            // based on error strategy...
            this.tmpSource.delete(key);
            ops.push({ type: 'deleteKey', key });
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            this.optimisticEntries.delete(key);
          }),
        ),
      );
    } else {
      ops.push(...(yield* this.syncKey(key)));
    }
    this.tanstackCollection.localBulkOperation(ops);
  });

  update = Effect.fn(function* (
    this: SmartOptimistic<T>,
    key: string,
    value: Partial<T>,
  ) {
    if (!this.tanstackCollection.get(key)) {
      return yield* Effect.dieMessage(`Item do not exist to update ${key}`);
    }

    this.optimisticEntries.set(key, {
      executing: false,
      ...this.optimisticEntries.get(key),
      updates: [
        ...(this.optimisticEntries.get(key)?.updates ?? []),
        { id: ulid(), type: 'update', value, kind: 'smart' },
      ],
    });
    this.tanstackCollection.localBulkOperation(yield* this.syncKey(key));
    this.queueUpdate(key);
  });

  clearTmpItem = (key: string) =>
    Effect.gen(this, function* () {
      this.tmpSource.delete(key);
      return yield* this.syncKey(key);
    });

  private queueUpdate = (key: string) => {
    return Effect.gen(this, function* () {
      const optimisticEntries = this.optimisticEntries.get(key);
      if (!optimisticEntries || optimisticEntries.executing || !this.onUpdate) {
        // Ignore.
        return;
      }
      const [firstSmartUpdate, ...smartUpdates] =
        optimisticEntries.updates.filter((v) => v.kind === 'smart');
      if (!firstSmartUpdate) {
        return;
      }

      optimisticEntries.executing = true;
      const value = smartUpdates.reduce(
        (acc, v) => ({ ...acc, ...v.value }),
        firstSmartUpdate.value,
      );
      yield* this.onUpdate(value).pipe(
        Effect.tap((result) =>
          Effect.gen(this, function* () {
            // Remove all smart updates.
            const optimisticEntriesLatest = this.optimisticEntries.get(key);
            if (!optimisticEntriesLatest) {
              throw new Error(
                'This is wrong. There should be currentOptimisticEntries',
              );
            }
            optimisticEntriesLatest.updates =
              optimisticEntriesLatest.updates.filter(
                (update) =>
                  ![firstSmartUpdate, ...smartUpdates]
                    .map((v) => v.id)
                    .includes(update.id),
              );

            this.tmpSource.set(key, result);
            this.tanstackCollection.localBulkOperation(
              yield* this.syncKey(key),
            );
          }),
        ),
        Effect.onError(() => {
          // What should be done in this case???
          return Effect.void;
        }),
        Effect.ensuring(
          Effect.sync(() => {
            optimisticEntries.executing = false;
            this.queueUpdate(key);
          }),
        ),
      );
    });
  };

  syncKey = (key: string) =>
    Effect.gen(this, function* () {
      const value = yield* Effect.promise(() => this.syncSource.get(key));
      const tmpValue = this.tmpSource.get(key);
      if (!value && !tmpValue) {
        console.error('No value with key present to sync', key);
        return [];
      }
      const initialValue = { ...value, ...tmpValue } as T;
      const optimisticUpdate = [
        ...(this.optimisticEntries.get(key)?.updates ?? []),
      ]?.reduce((acc, v) => ({ ...acc, ...v.value }), initialValue);

      return [{ type: 'upsert', value: optimisticUpdate }] as BulkOp[];
    });
}
