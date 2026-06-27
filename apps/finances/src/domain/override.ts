import { EntityESchema } from 'std-toolkit/eschema';
import { Schema } from 'effect';

export const OverrideSchema = EntityESchema.make('Override', 'transactionId', {
  category: Schema.String,
  subcategory: Schema.String,
  notes: Schema.optional(Schema.String),
  verified: Schema.Boolean,
  ignore: Schema.Boolean,
  cancelled_by: Schema.NullOr(Schema.String),
}).build();
