import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

const TransactionFields = {
  date: Schema.String,
  owner: Schema.String,
  bank: Schema.String,
  description: Schema.String,
  amount: Schema.Number,
  type: Schema.Literals(['credit', 'debit']),
  category: Schema.String,
  subcategory: Schema.String,
  is_transfer: Schema.Boolean,
};

export const TransactionSchema = EntityESchema.make(
  'Transaction',
  'id',
  TransactionFields,
).build();

export const ProjectionOutputSchema = Schema.Struct({
  generated_at: Schema.String,
  accounts: Schema.Array(Schema.String),
  total_transactions: Schema.Number,
  transactions: Schema.Array(TransactionSchema.schema),
});
