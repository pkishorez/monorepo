import { Collection, CollectionConfig, SyncConfig } from "@tanstack/react-db";
import { Effect } from "effect";
import { EntityType } from "@std-toolkit/core";
import { AnyESchema } from "@std-toolkit/eschema";

interface StdCollectionConfig<
  TItem extends object,
  TKey extends string | number,
  TSchema extends AnyESchema,
> {
  schema: TSchema;
  getKey: (item: TItem) => TKey;
  sync: (value: {
    collection: Collection<
      TItem,
      TKey,
      CollectionUtils<TSchema>,
      TSchema,
      object
    >;
  }) => Effect.Effect<readonly EntityType<TItem>[]>;
  onInsert: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    current: TItem,
    item: Partial<TItem>,
  ) => Effect.Effect<EntityType<Partial<TItem>>>;
}

export type CollectionUtils<TSchema extends AnyESchema = AnyESchema> = {
  upsert: (item: EntityType<TSchema["Type"]>) => void;
  schema: () => TSchema;
};
export const stdCollectionOptions = <
  TSchema extends AnyESchema,
  TKey extends string | number = string | number,
>(
  options: StdCollectionConfig<TSchema["Type"], TKey, TSchema>,
): CollectionConfig<
  TSchema["Type"],
  TKey,
  TSchema,
  CollectionUtils<TSchema>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  const { onInsert, onUpdate, sync, ...tanstackOptions } = options;

  type SyncParams = Parameters<SyncConfig<TItem, TKey>["sync"]>[0];
  const syncParamsRef: { current: SyncParams | null } = { current: null };

  const applyLocalChanges = (values: EntityType<TItem>[]) => {
    if (!syncParamsRef.current) return;

    const { begin, collection, commit, write } = syncParamsRef.current;
    begin();
    for (const value of values) {
      const key = collection.getKeyFromItem(value.value as TItem);
      const itemValue = { ...value.value, _u: value.meta._u } as TItem;
      if (collection.has(key)) {
        if (value.meta._d) {
          write({ type: "delete", key });
        } else {
          write({ type: "update", value: itemValue });
        }
        break;
      }

      if (!value.meta._d) {
        write({ type: "insert", value: itemValue });
      }
    }
    commit();
  };

  const tanstackSync: SyncConfig<TItem, TKey> = {
    sync: (params) => {
      syncParamsRef.current = params;
      const { collection } = params;
      Effect.runPromise(sync({ collection })).then((items) =>
        applyLocalChanges([...items]),
      );
      params.markReady();
    },
  };

  const utils: CollectionUtils<TSchema> = {
    upsert: (item) => applyLocalChanges([item]),
    schema: () => options.schema,
  };

  const entityCache = new Map<TKey, EntityType<TItem>>();

  return {
    ...tanstackOptions,
    sync: tanstackSync,
    utils,
    compare: (x, y) => (x._u < y._u ? -1 : 1),
    onInsert: async ({ transaction }) => {
      const { changes, key } = transaction.mutations[0]!;
      const result = await Effect.runPromise(onInsert(changes as TItem));
      entityCache.set(key as TKey, result);
      applyLocalChanges([result]);
    },
    onUpdate: async ({ transaction, collection }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0]!;
      const current = collection.get(key)!;
      const update = await Effect.runPromise(onUpdate(current, changes));
      const merged = {
        ...entityCache.get(key as TKey),
        ...update,
      } as EntityType<TItem>;
      entityCache.set(key as TKey, merged);
      applyLocalChanges([merged]);
    },
  };
};
