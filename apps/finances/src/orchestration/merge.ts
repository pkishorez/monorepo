import type { OverrideSchema } from '@/domain';
import type { TransactionSchema } from '@/domain';
import type { MergedTransaction } from '@/domain/merged-transaction.js';

type Transaction = typeof TransactionSchema.Type;
type Override = typeof OverrideSchema.Type;

export type { MergedTransaction };

/**
 * Spreads override fields over matching transactions by `transactionId`.
 * Override `category`, `subcategory`, `notes`, `verified`, and `ignore` win
 * over the original transaction fields when present.
 */
export function mergeTransactionsWithOverrides(
  transactions: readonly Transaction[],
  overrides: readonly Override[],
): MergedTransaction[] {
  const overrideMap = new Map<string, Override>();
  for (const o of overrides) {
    overrideMap.set(o.transactionId, o);
  }

  return transactions.map((txn) => {
    const override = overrideMap.get(txn.id);
    if (!override) return { ...txn };

    return {
      ...txn,
      category: override.category,
      subcategory: override.subcategory,
      ...(override.notes !== undefined ? { notes: override.notes } : {}),
      verified: override.verified,
      ignore: override.ignore,
      cancelled_by: override.cancelled_by,
    };
  });
}

/** Returns transactions where `verified` is not `true`. */
export function filterUnverified(
  merged: MergedTransaction[],
): MergedTransaction[] {
  return merged.filter((txn) => txn.verified !== true);
}

/** Sorts by `Math.abs(amount)` descending. */
export function sortByAmountDesc(
  transactions: MergedTransaction[],
): MergedTransaction[] {
  return [...transactions].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
  );
}

/** Calculates what percentage of total debit spend is verified. */
export function computeCoverage(allDebits: MergedTransaction[]): {
  verified: number;
  total: number;
  percentage: number;
} {
  let verified = 0;
  let total = 0;

  for (const txn of allDebits) {
    if (txn.cancelled_by) continue;
    const absAmount = Math.abs(txn.amount);
    total += absAmount;
    if (txn.verified === true) {
      verified += absAmount;
    }
  }

  return {
    verified,
    total,
    percentage: total === 0 ? 0 : Math.round((verified / total) * 100),
  };
}
