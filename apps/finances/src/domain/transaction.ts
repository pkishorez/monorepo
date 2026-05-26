import { Schema } from 'effect';

export class TransactionSchema extends Schema.Class<TransactionSchema>(
  'TransactionSchema',
)({
  id: Schema.String,
  date: Schema.String,
  owner: Schema.String,
  bank: Schema.String,
  description: Schema.String,
  amount: Schema.Number,
  type: Schema.Literal('credit', 'debit'),
  category: Schema.String,
  subcategory: Schema.String,
  is_transfer: Schema.Boolean,
}) {}

export const ProjectionOutputSchema = Schema.Struct({
  generated_at: Schema.String,
  accounts: Schema.Array(Schema.String),
  total_transactions: Schema.Number,
  transactions: Schema.Array(TransactionSchema),
});
