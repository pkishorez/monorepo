import { CollectionConfig, SyncConfig } from "@tanstack/react-db";
import { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect, ManagedRuntime } from "effect";
import { EntityType } from "./schema";
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
  runtime: ManagedRuntime.ManagedRuntime<any, never>;
  sync: (item?: TItem) => Effect.Effect<readonly EntityType<TItem>[], any, any>;
  onInsert: (item: TItem) => Effect.Effect<EntityType<TItem>, any, any>;
  onUpdate?: (
    item: Partial<TItem>,
  ) => Effect.Effect<EntityType<Partial<TItem>>, any, any>;
  onDelete?: Effect.Effect<void, any, any>;
}

type MyUtils = {};
export const stdCollectionOptions = <
  TSchema extends AnyESchema,
  TKey extends string | number = string | number,
>(
  options: StdCollectionConfig<TSchema["Type"], TKey, TSchema>,
): CollectionConfig<TSchema["Type"], TKey, TSchema, MyUtils> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  const { onInsert, onUpdate, sync, onDelete, runtime, ...tanstackOptions } =
    options;
  let ref: {
    current: Parameters<SyncConfig<any, any>["sync"]>[0] | null;
  } = {
    current: null,
  };
  const tanstackSync: SyncConfig<TItem, TKey> = {
    sync: (params) => {
      ref.current = params;
      runtime.runPromise(sync()).then((items) => localUpsert([...items]));
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

      const result = await runtime.runPromise(onInsert(changes as any));
      valueMap.set(key, result);
      localUpsert([result]);
    },
    onUpdate: async ({ transaction }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0];
      const update = await runtime.runPromise(onUpdate(changes as any));

      const newValue = { ...valueMap.get(key), ...update } as any;
      valueMap.set(key, newValue);
      localUpsert([newValue]);
    },
  };
};
