import { Schema } from 'effect';
import { MetaSchema } from '@std-toolkit/core';

export const OldToNewStateSchema = Schema.Struct({
  cursor: Schema.NullOr(
    Schema.Struct({
      value: Schema.Unknown,
      meta: MetaSchema,
    }),
  ),
});

/**
 * Sync-state shape for the `oldToNew` strategy: the newest entity yet drained,
 * used as the cursor for the next fetch.
 */
export type OldToNewState = typeof OldToNewStateSchema.Type;
