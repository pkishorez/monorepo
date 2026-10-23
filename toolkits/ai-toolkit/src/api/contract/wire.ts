import { Schema } from 'effect';
import { EntityMetaSchema } from '@kestack/std-toolkit/core';
import { HARNESS_NAMES } from '../../services/records/raw/index.js';

/*
 * What every group's feeds and payloads share. Feeds carry entities in
 * encoded form, each at its own version, so a client keeps them as they
 * came and reads them with its own ESchemas.
 */

/** An entity in encoded form, as feeds send it and take it back as a cursor. */
export const WireEntity = Schema.Struct({
  value: Schema.Unknown,
  meta: EntityMetaSchema,
});
export type WireEntity = typeof WireEntity.Type;

/** A feed's payload: replay every change after this entity, or all of them. */
export const Cursor = { after: Schema.NullOr(WireEntity) };
export const Batch = Schema.Array(WireEntity);

export const Harness = Schema.Literals(HARNESS_NAMES);
