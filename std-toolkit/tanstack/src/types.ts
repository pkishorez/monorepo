import { Effect, SubscriptionRef } from 'effect';
import { EntityType, MetaSchema } from '@std-toolkit/core';
import {
  AnyEntityESchema,
  AnySingleEntityESchema,
  ESchemaEncoded,
} from '@std-toolkit/eschema';
import type { PartitionKey } from '@std-toolkit/cache';

/**
 * Decoded shape of an item inside a TanStack collection. `T` is
 * `ESchemaType<S>` (the rich, decoded form). `_meta` carries the row's
 * version/updated/deleted metadata.
 */
export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
};

export type CollectionUtils<
  TSchema extends AnyEntityESchema = AnyEntityESchema,
> = {
  /**
   * Inject a wire-shape (encoded) row (or rows) into the collection. The
   * collection holds decoded items, so `upsert` decodes via the schema
   * before applying.
   */
  upsert: (
    item:
      | EntityType<ESchemaEncoded<TSchema>>
      | EntityType<ESchemaEncoded<TSchema>>[],
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
  upsert: (
    item: EntityType<ESchemaEncoded<TSchema>>,
    persist?: boolean,
  ) => void;
  schema: () => TSchema;
  refetch: () => Effect.Effect<void>;
  isSyncing: () => SubscriptionRef.SubscriptionRef<boolean>;
};
