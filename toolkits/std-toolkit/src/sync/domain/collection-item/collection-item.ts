import type { CollectionConfig, VirtualRowProps } from '@tanstack/react-db';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Equal, Schema } from 'effect';
import type { EntityMetaSchema } from '../../../core/index.js';
import type {
  AnyESchema,
  AnyEntityESchema,
  ESchemaIdField,
} from '../../../eschema/index.js';

/**
 * TanStack DB row form of an entity: value fields hoisted to the top level with
 * meta nested under `_meta`, plus the runtime virtual props ($synced, $origin).
 *
 * Virtual props are added at runtime by @tanstack/db on every read, but the
 * `useLiveQuery(() => collection)` overload types `data` as the bare item type and
 * drops them. The props are optional so they surface on reads without being
 * required on writes. The collection schema validates the latest value shape.
 */
export type CollectionItem<T> = T & {
  _meta?: typeof EntityMetaSchema.Type;
} & Partial<VirtualRowProps<string>>;

export type CollectionItemSchema<S extends AnyESchema> = StandardSchemaV1<
  CollectionItem<S['Type']>,
  CollectionItem<S['Type']>
>;

export const makeCollectionItemSchema = <S extends AnyESchema>(
  schema: S,
): CollectionItemSchema<S> => {
  const isValue = Schema.is(Schema.toType(Schema.Struct(schema.fields)));
  return {
    '~standard': {
      version: 1,
      vendor: '@kstackz/std-toolkit/sync',
      types: {
        input: null as unknown as CollectionItem<S['Type']>,
        output: null as unknown as CollectionItem<S['Type']>,
      },
      validate: (input) => {
        if (input === null || typeof input !== 'object') {
          return { issues: [{ message: 'CollectionItem must be an object' }] };
        }
        const value = stripMeta(input);
        return Object.hasOwn(value, '_v') || !isValue(value)
          ? {
              issues: [
                {
                  message: `CollectionItem does not match schema "${schema.name}"`,
                },
              ],
            }
          : { value: input };
      },
    },
  };
};

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

export const changedFields = (before: object, after: object): string[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (field) =>
      !Equal.equals(
        (before as Record<string, unknown>)[field],
        (after as Record<string, unknown>)[field],
      ),
  );
