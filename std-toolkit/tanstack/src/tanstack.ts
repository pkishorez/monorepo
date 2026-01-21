import {
  BaseCollectionConfig,
  CollectionConfig,
  createCollection,
  InferSchemaOutput,
  StandardSchema,
  SyncConfig,
} from "@tanstack/react-db";
import { SafePick } from "./types";
import { Effect } from "effect";
import { EntityType } from "./schema";
interface StdCollectionConfig<
  TItem extends object,
  TKey extends string | number = string | number,
  TSchema extends StandardSchema<any> = never,
> extends SafePick<
  BaseCollectionConfig<InferSchemaOutput<TItem>, TKey, TSchema>,
  "getKey"
> {
  schema: TSchema;
  sync: (item?: TItem) => Effect.Effect<EntityType<TItem>[]>;
  onInsert: (item: TItem) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    item: Partial<TItem>,
  ) => Effect.Effect<EntityType<Partial<TItem>>>;
  onDelete?: Effect.Effect<void>;
}

type MyUtils = {};
export const stdCollectionOptions = <
  TItem extends object,
  TKey extends string | number = string | number,
  TSchema extends StandardSchema<any> = never,
>(
  options: StdCollectionConfig<TItem, TKey, TSchema>,
): CollectionConfig<InferSchemaOutput<TItem>, TKey, TSchema, MyUtils> => {
  const { onInsert, onUpdate, sync, onDelete, ...tanstackOptions } = options;
  let ref: {
    current: Parameters<SyncConfig<any, any>["sync"]>[0] | null;
  } = {
    current: null,
  };
  const tanstackSync: SyncConfig<InferSchemaOutput<TItem>, TKey> = {
    sync: (params) => {
      ref.current = params;
      Effect.runPromise(sync()).then(localUpsert);
      params.markReady();
    },
  };
  const localUpsert = (values: EntityType<TItem>[]) => {
    if (!ref.current) return;

    const { begin, collection, commit, write } = ref.current;
    begin();
    for (let value of values) {
      const key = collection.getKeyFromItem(value.value as any);
      if (collection.has(key)) {
        if (value.meta._d) {
          write({ type: "delete", key });
        } else {
          write({ type: "update", value: value.value as any });
        }
        break;
      }

      if (!value.meta._d) {
        write({ type: "insert", value: value.value as any });
      }
    }
    commit();
  };
  const utils: MyUtils = {};
  const valueMap: Map<string, EntityType<TItem>> = new Map();

  return {
    ...tanstackOptions,
    sync: tanstackSync,
    utils,
    onInsert: async ({ transaction }) => {
      const { changes, key } = transaction.mutations[0];

      const result = await Effect.runPromise(onInsert(changes as any));
      valueMap.set(key, result);
      localUpsert([result]);
    },
    onUpdate: async ({ transaction }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0];
      const update = await Effect.runPromise(onUpdate(changes as any));

      const newValue = { ...valueMap.get(key), ...update } as any;
      valueMap.set(key, newValue);
      localUpsert([newValue]);
    },
  };
};

export const collection = createCollection(stdCollectionOptions({} as any));
