import { Effect, SubscriptionRef } from "effect";
import { EntityType, MetaSchema } from "@std-toolkit/core";
import { AnyEntityESchema, AnySingleEntityESchema } from "@std-toolkit/eschema";

export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
};

export type CollectionUtils<TSchema extends AnyEntityESchema = AnyEntityESchema> = {
  upsert: (
    item: EntityType<TSchema["Type"]> | EntityType<TSchema["Type"]>[],
    persist?: boolean,
  ) => void;
  schema: () => TSchema;
  fetch: () => Effect.Effect<number>;
  fetchAll: () => Effect.Effect<number>;
  isSyncing: SubscriptionRef.SubscriptionRef<boolean>;
};

export type SingleItemUtils<
  TSchema extends AnySingleEntityESchema = AnySingleEntityESchema,
> = {
  schema: () => TSchema;
  refetch: () => Effect.Effect<void>;
  isSyncing: SubscriptionRef.SubscriptionRef<boolean>;
};
