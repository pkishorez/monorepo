import { Collection, CollectionConfig, SyncConfig } from "@tanstack/react-db";
import { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect } from "effect";
import { EntityType } from "@std-toolkit/core";
import { AnyESchema } from "@std-toolkit/eschema";

interface StdCollectionConfig<
  TItem extends object,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1<unknown, TItem> = StandardSchemaV1<
    unknown,
    TItem
  >,
> {
  schema: TSchema;
  getKey: (item: TItem) => TKey;
  sync: (value: {
    item?: TItem;
    collection: Collection<any, any, MyUtils<any>, any, any>;
  }) => Effect.Effect<readonly EntityType<TItem>[]>;
  onInsert: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    current: TItem,
    item: Partial<TItem>,
  ) => Effect.Effect<EntityType<Partial<TItem>>>;
  onDelete?: (item: TItem) => Effect.Effect<void>;
}

export type MyUtils<TItem> = {
  upsert: (item: EntityType<TItem>) => void;
  entityName: string;
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
  MyUtils<TSchema["Type"]>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  const { onInsert, onUpdate, sync, onDelete, ...tanstackOptions } = options;
  let ref: {
    current: Parameters<SyncConfig<any, any>["sync"]>[0] | null;
  } = {
    current: null,
  };
  const tanstackSync: SyncConfig<TItem, TKey> = {
    sync: (params) => {
      ref.current = params;
      const { collection } = params;
      Effect.runPromise(sync({ collection })).then((items) =>
        localUpsert([...items]),
      );
      params.markReady();
    },
  };
  const localUpsert = (values: EntityType<TItem>[]) => {
    if (!ref.current) return;

    const { begin, collection, commit, write } = ref.current;
    begin();
    for (let value of values) {
      const key = collection.getKeyFromItem(value.value as any);
      const itemValue = { ...value.value, _u: value.meta._u };
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
  const utils: MyUtils<TItem> = {
    upsert(item) {
      localUpsert([item]);
    },
    entityName: options.schema.name,
  };
  const valueMap: Map<string, EntityType<TItem>> = new Map();

  return {
    ...tanstackOptions,
    sync: tanstackSync,
    utils,
    compare: (x, y) => (x._u < y._u ? -1 : 1),
    onInsert: async ({ transaction }) => {
      const { changes, key } = transaction.mutations[0];

      const result = await Effect.runPromise(onInsert(changes as any));
      valueMap.set(key, result);
      localUpsert([result]);
    },
    onUpdate: async ({ transaction, collection }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0];
      const update = await Effect.runPromise(
        onUpdate(collection.get(key)!, changes),
      );

      const newValue = { ...valueMap.get(key), ...update } as any;
      valueMap.set(key, newValue);
      localUpsert([newValue]);
    },
  };
};
