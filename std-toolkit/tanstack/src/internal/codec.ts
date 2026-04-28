import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type {
  AnyESchema,
  ESchemaEncoded,
  ESchemaType,
} from '@std-toolkit/eschema';
import type { CollectionItem } from '../types.js';

/**
 * Decodes an encoded `EntityType<ESchemaEncoded<S>>` (the wire/cache shape)
 * into a `CollectionItem<ESchemaType<S>>` ready for the TanStack store. Runs
 * the eschema decode synchronously so failures bubble up as exceptions —
 * decode errors at the collection boundary indicate schema drift and should
 * be loud, not silently dropped.
 */
export const decodeRow = <S extends AnyESchema>(
  schema: S,
  row: EntityType<ESchemaEncoded<S>>,
): CollectionItem<ESchemaType<S>> => {
  const decoded = Effect.runSync(schema.decode(row.value)) as ESchemaType<S>;
  return { ...decoded, _meta: row.meta } as CollectionItem<ESchemaType<S>>;
};

/**
 * Encodes a `CollectionItem<ESchemaType<S>>` back to the wire shape
 * `EntityType<ESchemaEncoded<S>>`. The `_meta` is split out — it lives in
 * `meta` on the wire, not as a property on `value`.
 */
export const encodeRow = <S extends AnyESchema>(
  schema: S,
  item: CollectionItem<ESchemaType<S>>,
): EntityType<ESchemaEncoded<S>> => {
  const { _meta, ...rest } = item as CollectionItem<ESchemaType<S>> & {
    _meta?: EntityType<unknown>['meta'];
  };
  if (!_meta) {
    throw new Error(
      '[std-toolkit/tanstack] encodeRow: collection item is missing _meta',
    );
  }
  const encoded = Effect.runSync(
    schema.encode(rest as ESchemaType<S>),
  ) as ESchemaEncoded<S>;
  return { value: encoded, meta: _meta };
};
