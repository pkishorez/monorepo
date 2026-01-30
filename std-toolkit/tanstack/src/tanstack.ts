import { Collection, CollectionConfig, SyncConfig } from "@tanstack/react-db";
import { Effect } from "effect";
import { EntityType } from "@std-toolkit/core";
import { CacheEntity } from "@std-toolkit/cache";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import { AnyESchema, ESchemaIdField } from "@std-toolkit/eschema";

interface StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyESchema,
> {
  schema: TSchema;
  cache?: CacheEntity<TItem>;
  sync: (value: {
    collection: Collection<
      TItem,
      string,
      CollectionUtils<TSchema>,
      TSchema,
      object
    >;
    onReady: () => void;
  }) => {
    effect: (latest: EntityType<TItem> | null) => Effect.Effect<void>;
    onCleanup?: () => void;
  };
  onInsert: (
    item: Omit<TItem, ESchemaIdField<TSchema>>,
  ) => Effect.Effect<EntityType<TItem>>;
  onUpdate?: (
    payload: {
      [K in ESchemaIdField<TSchema>]: string;
    } & {
      updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
    },
  ) => Effect.Effect<EntityType<TItem>>;
}

export type CollectionUtils<TSchema extends AnyESchema = AnyESchema> = {
  upsert: (item: EntityType<TSchema["Type"]>, persist?: boolean) => void;
  schema: () => TSchema;
};
export const stdCollectionOptions = <TSchema extends AnyESchema>(
  options: StdCollectionConfig<TSchema["Type"], TSchema>,
): CollectionConfig<
  TSchema["Type"],
  string,
  TSchema,
  CollectionUtils<TSchema>
> & {
  schema: TSchema;
} => {
  type TItem = TSchema["Type"];
  const {
    onInsert,
    cache = new MemoryCacheEntity(options.schema),
    onUpdate,
    sync,
    schema,
  } = options;
  const getKey = (item: TItem): string =>
    item[schema.idField as keyof TItem] as string;

  type SyncParams = Parameters<SyncConfig<TItem, string>["sync"]>[0];
  const syncParamsRef: { current: SyncParams | null } = { current: null };

  const applyLocalChanges = (
    values: readonly EntityType<TItem>[],
    persist = false,
  ) => {
    if (!syncParamsRef.current) return;

    const { begin, collection, commit, write } = syncParamsRef.current;
    begin();
    for (const value of values) {
      const key = collection.getKeyFromItem(value.value as TItem);
      const itemValue = { ...value.value, _uid: value.meta._uid } as TItem;
      if (persist) {
        Effect.runPromise(cache.put(value));
      }
      if (collection.has(key)) {
        if (value.meta._d) {
          write({ type: "delete", key });
        } else {
          write({ type: "update", value: itemValue });
        }
        continue;
      }

      if (!value.meta._d) {
        write({ type: "insert", value: itemValue });
      }
    }
    commit();
  };

  const tanstackSync: SyncConfig<TItem, string> = {
    sync: (params) => {
      syncParamsRef.current = params;
      const { collection, markReady } = params;
      const { effect, onCleanup } = sync({
        collection,
        onReady: () => {
          params.markReady();
        },
      });
      Effect.runPromise(
        Effect.gen(function* () {
          const allItems = (yield* cache.getAll()).sort((a, z) =>
            a.meta._uid.localeCompare(z.meta._uid),
          );
          const latest = allItems.at(-1);

          applyLocalChanges(allItems);
          if (allItems.length > 0) {
            markReady();
          }
          yield* effect(latest ? latest : null);
        }),
      );

      return onCleanup;
    },
  };

  const utils: CollectionUtils<TSchema> = {
    upsert: (item, persist) => applyLocalChanges([item], persist),
    schema: () => options.schema,
  };

  return {
    schema,
    getKey,
    sync: tanstackSync,
    utils,
    compare: (x, y) =>
      (x as TItem & { _uid: string })._uid <
      (y as TItem & { _uid: string })._uid
        ? -1
        : 1,
    onInsert: async ({ transaction }) => {
      const { changes } = transaction.mutations[0]!;
      const result = await Effect.runPromise(onInsert(changes as TItem));
      applyLocalChanges([result]);
    },
    onUpdate: async ({ transaction }) => {
      if (!onUpdate) return;
      const { changes, key } = transaction.mutations[0]!;
      const payload = {
        [schema.idField]: key,
        updates: changes,
      } as {
        [K in ESchemaIdField<TSchema>]: string;
      } & {
        updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
      };
      const result = await Effect.runPromise(onUpdate(payload));
      applyLocalChanges([result]);
    },
  };
};
