import { Schema } from 'effect';
import { ESchema, toSchema } from '../../../eschema/index.js';
import {
  SnapshotChangeSchema,
  TableSnapshotESchema,
} from '../../../snapshot/index.js';

/**
 * What the reserved enforcement item holds: the schema contract the table
 * last accepted, plus two pieces of operational state that never belong in
 * the contract itself. `floors` is, per registered entity, the lowest
 * version any stored row may still carry. `owedBackfills` are the
 * requires-backfill changes accepted here that no table-wide rewrite has
 * repaired yet. Golden rows never appear here; they live in the test file.
 */
export const TableBaselineESchema = ESchema.make('TableBaseline', {
  snapshot: toSchema(TableSnapshotESchema),
  floors: Schema.Record(Schema.String, Schema.String),
  owedBackfills: Schema.Array(
    Schema.Struct({
      accepted: Schema.String,
      change: SnapshotChangeSchema,
    }),
  ),
}).build();

export type TableBaseline = typeof TableBaselineESchema.Type;
