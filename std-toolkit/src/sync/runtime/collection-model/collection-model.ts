import type { CollectionConfig, VirtualRowProps } from '@tanstack/react-db';
import type { Effect } from 'effect';
import type {
  EntityType,
  MetaSchema,
  SingleEntityType,
} from '../../../core/index.js';
import type {
  AnyEntityESchema,
  ESchemaIdField,
} from '../../../eschema/index.js';

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
 * An old→new cursor fetch source. A worker or repair capability declares one
 * only when it consumes that direction.
 */
export type ForwardFetch<T, R = never, E = never> = (ctx: {
  cursor: EntityType<T> | null;
}) => Effect.Effect<EntityType<T>[], E, R>;

/**
 * Pass-through TanStack collection options, with the fields the engine owns
 * (id, getKey, schema, sync wiring, mutation handlers, utils) removed.
 */
export type StdCollectionOptions<TItem extends object> = Omit<
  CollectionConfig<CollectionItem<TItem>, string>,
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
 * Payload for a keyed update: the complete value before the mutation plus the
 * partial updates (the id field itself excluded from the updatable fields).
 */
export type UpdatePayload<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = {
  current: TItem;
  updates: Partial<Omit<TItem, ESchemaIdField<TSchema>>>;
};

export type DeletePayload<TItem extends object> = {
  current: TItem;
};

export type UpdateChanges<
  TItem extends object,
  TSchema extends AnyEntityESchema,
> = UpdatePayload<TItem, TSchema>['updates'];

export const stripMeta = <TItem extends object>(
  item: CollectionItem<TItem>,
): TItem => {
  const {
    _meta: _ignoredMeta,
    $synced: _ignoredSynced,
    $origin: _ignoredOrigin,
    ...value
  } = item;
  return value as TItem;
};

export const stripMetaPartial = <TItem extends object>(
  item: Partial<CollectionItem<TItem>>,
): Partial<TItem> => {
  const {
    _meta: _ignoredMeta,
    $synced: _ignoredSynced,
    $origin: _ignoredOrigin,
    ...value
  } = item;
  return value as Partial<TItem>;
};

export const toEntity = <TItem>(
  entity: SingleEntityType<TItem>,
): EntityType<TItem> => ({
  value: entity.value,
  meta: { ...entity.meta, _d: false },
});
