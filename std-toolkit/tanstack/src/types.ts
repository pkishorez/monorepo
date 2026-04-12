import { Effect, SubscriptionRef } from "effect";
import { EntityType, MetaSchema } from "@std-toolkit/core";
import { AnyEntityESchema, AnySingleEntityESchema } from "@std-toolkit/eschema";
import type { PartitionKey } from "@std-toolkit/cache";

export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
};

export type CollectionUtils<TSchema extends AnyEntityESchema = AnyEntityESchema> = {
  upsert: (
    item: EntityType<TSchema["Type"]> | EntityType<TSchema["Type"]>[],
    persist?: boolean,
  ) => void;
  schema: () => TSchema;
  fetch: (partition?: PartitionKey) => Effect.Effect<number>;
  fetchAll: (partition?: PartitionKey) => Effect.Effect<number>;
  isSyncing: () => SubscriptionRef.SubscriptionRef<boolean>;
};

export type SingleItemUtils<
  TSchema extends AnySingleEntityESchema = AnySingleEntityESchema,
> = {
  upsert: (item: EntityType<TSchema["Type"]>, persist?: boolean) => void;
  schema: () => TSchema;
  refetch: () => Effect.Effect<void>;
  isSyncing: () => SubscriptionRef.SubscriptionRef<boolean>;
};
