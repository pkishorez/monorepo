import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';
import { stdCollectionOptions } from '@std-toolkit/tanstack';
import type { TransactionSchema } from '@/domain/transaction';

const TransactionESchema = EntityESchema.make('Transaction', 'id', {
  date: Schema.String,
  owner: Schema.String,
  bank: Schema.String,
  description: Schema.String,
  amount: Schema.Number,
  type: Schema.Literal('credit', 'debit'),
  category: Schema.String,
  subcategory: Schema.String,
  is_transfer: Schema.Boolean,
}).build();

export const transactionsCollection = createCollection(
  stdCollectionOptions({
    schema: TransactionESchema,
    syncMode: 'eager',
    getMore: () => Effect.succeed([]),
  }),
);

export function replaceTransactions(transactions: TransactionSchema[]) {
  const keys = Array.from(transactionsCollection.state.keys());
  if (keys.length > 0) {
    transactionsCollection.delete(keys);
  }

  if (transactions.length > 0) {
    const now = new Date().toISOString();
    const items = transactions.map((t) => ({
      ...t,
      _meta: { _v: '1', _e: 'Transaction', _d: false, _u: now },
    }));
    transactionsCollection.insert(items);
  }
}
