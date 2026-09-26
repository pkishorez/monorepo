import { Schema } from 'effect';
import type { StateEntitySchema } from '../../state/index.js';

export const oldToNewStateSchema = (entity: StateEntitySchema) =>
  Schema.Struct({ cursor: Schema.NullOr(entity) });

/**
 * Sync-state shape for the `oldToNew` strategy: the newest entity yet drained,
 * used as the cursor for the next fetch.
 */
export type OldToNewState = ReturnType<typeof oldToNewStateSchema>['Type'];
