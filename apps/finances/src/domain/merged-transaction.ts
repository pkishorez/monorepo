import type { TransactionSchema } from './transaction.js';

type Transaction = typeof TransactionSchema.Type;

/** A transaction enriched with override fields from the overrides collection. */
export interface MergedTransaction extends Transaction {
  original_category?: string;
  notes?: string;
  verified?: boolean;
  ignore?: boolean;
  cancelled_by?: string | null;
}
