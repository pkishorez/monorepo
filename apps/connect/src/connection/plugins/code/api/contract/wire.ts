import { Schema } from 'effect';
import { EntityMetaSchema } from '@kestack/std-toolkit/core';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { HARNESS_NAMES } from '@kestack/ai-toolkit/contract';

/*
 * What every group's feeds and payloads share. Feeds carry entities in
 * encoded form, each at its own version, so a client keeps them as they
 * came and reads them with its own ESchemas.
 */

/** Any value but null or undefined, read as it is, unchecked. */
export const Opaque = ESchema.fromType<NonNullable<unknown>>();

/** An entity in encoded form, as feeds send it and take it back as a cursor. */
export const WireEntity = ESchema.make('WireEntity', {
  value: Opaque,
  meta: EntityMetaSchema,
}).build();
export type WireEntity = typeof WireEntity.Type;

/** A feed's payload: replay every change after this entity, or all of them. */
export const Cursor = ESchema.make('Cursor', {
  after: Schema.NullOr(WireEntity.schema),
}).build();
export const Batch = Schema.Array(WireEntity.schema);

export const Harness = Schema.Literals(HARNESS_NAMES);

/**
 * One case of a union, tagged by `_tag`. An ESchema stores no constructor
 * default, so the tag is a plain literal, not `Schema.tag`.
 */
export const tagged = <
  const Tag extends string,
  Fields extends Schema.Struct.Fields,
>(
  tag: Tag,
  fields: Fields,
) => Schema.Struct({ _tag: Schema.Literal(tag), ...fields });
