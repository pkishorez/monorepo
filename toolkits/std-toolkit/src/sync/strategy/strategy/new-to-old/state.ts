import { Schema } from 'effect';
import type { StateEntitySchema } from '../../state/index.js';
import { sliceSchema } from '../slice-coverage.js';

export const newToOldStateSchema = (entity: StateEntitySchema) =>
  Schema.Struct({
    slices: Schema.Array(sliceSchema(entity)),
    reachedOldest: Schema.Boolean,
  });

export type NewToOldState = ReturnType<typeof newToOldStateSchema>['Type'];
