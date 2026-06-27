import type { CollectionConfig, VirtualRowProps } from '@tanstack/react-db';
import type { Effect } from 'effect';
import type { EntityType, MetaSchema } from '../core/index.js';
import type { AnyEntityESchema, ESchemaIdField } from '../eschema/index.js';

/**
 * TanStack DB row form of an entity: value fields hoisted to the top level with
 * meta nested under `_meta`, plus the runtime virtual props ($synced, $origin).
 *
 * Virtual props are added at runtime by @tanstack/db on every read, but the
 * `useLiveQuery(() => collection)` overload types `data` as the bare row type and
 * drops them. The collection is created without a StandardSchema, so input and
 * output share one row type — hence the props are declared optional, surfacing on
 * reads without being required on writes.
 */
export type CollectionItem<T> = T & {
  _meta?: typeof MetaSchema.Type;
} & Partial<VirtualRowProps<string>>;

/**
 * Per-partition forward (old→new) fetch source. The partition factory supplies
 * one; old→new and bidirectional consume it as their forward direction (new→old
 * declares but does not consume it), and the cadence repair loop reuses it.
 */
export type ForwardFetch<T> = (ctx: {
  cursor: EntityType<T> | null;
}) => Effect.Effect<EntityType<T>[]>;

/**
 * Pass-through TanStack collection options, with the fields the engine owns
 * (id, getKey, schema, sync wiring, mutation handlers, utils) removed.
 */
export type StdCollectionOptions = Omit<
  CollectionConfig<any, string>,
  | 'id'
  | 'getKey'
  | 'schema'
  | 'syncMode'
  | 'sync'
  | 'rowUpdateMode'
  | 'onInsert'
  | 'onUpdate'
  | 'onDelete'
  | 'utils'
>;

/**
 * Payload for a keyed update: the entity's id field plus a partial set of value
 * updates (the id field itself excluded from the updatable fields).
 */
export type UpdatePayload<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = {
  [K in ESchemaIdField<TSchema>]: string;
} & {
  updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
};
