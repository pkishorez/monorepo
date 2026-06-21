import { Schema } from 'effect';
import { MetaSchema } from '@std-toolkit/core';

const CursorSchema = Schema.Struct({
  value: Schema.Unknown,
  meta: MetaSchema,
});

const SliceSchema = Schema.Struct({
  low: CursorSchema,
  high: CursorSchema,
});

export const NewToOldStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
  reachedOldest: Schema.Boolean,
});

/**
 * Sync-state shape for the `newToOld` strategy.
 *
 * `slices` is the disjoint, ascending list of contiguous loaded `_u` ranges
 * (`low`/`high` are the oldest and newest cursors of each range). `reachedOldest`
 * is a collection-level flag that flips true only after the lowest material
 * slice has been proven to reach the absolute floor. Empty collections keep the
 * floor unproven because there is no bottom slice to anchor future gaps.
 */
export type NewToOldState = typeof NewToOldStateSchema.Type;
