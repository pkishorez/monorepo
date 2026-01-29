import { Collection, CollectionConfig, SyncConfig } from "@tanstack/react-db";
import { Effect } from "effect";
import { EntityType } from "@std-toolkit/core";
import { AnyESchema, ESchemaIdField } from "@std-toolkit/eschema";

interface StdCollectionConfig<
  TItem extends object,
  TSchema extends AnyESchema,
> {
  schema: TSchema;
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
    effect: Effect.Effect<readonly EntityType<TItem>[]>;
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
  upsert: (item: EntityType<TSchema["Type"]>) => void;
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
  const { onInsert, onUpdate, sync, schema } = options;
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
      const { collection } = params;
      const { effect, onCleanup } = sync({
        collection,
        onReady: () => {
          params.markReady();
        },
      });
      Effect.runPromise(effect).then(applyLocalChanges);

      return onCleanup;
    },
  };

  const utils: CollectionUtils<TSchema> = {
    upsert: (item) => applyLocalChanges([item]),
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
