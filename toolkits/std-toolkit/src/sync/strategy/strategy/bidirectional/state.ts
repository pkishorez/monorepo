import { Schema } from 'effect';
import type { StateEntitySchema } from '../../state/index.js';
import { sliceSchema } from '../slice-coverage.js';

export const bidirectionalStateSchema = (entity: StateEntitySchema) =>
  Schema.Struct({ slices: Schema.Array(sliceSchema(entity)) });

export type BidirectionalState = ReturnType<
  typeof bidirectionalStateSchema
>['Type'];
