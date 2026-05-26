import type { MergedTransaction } from './merge.js';

export interface MonthlyRow {
  month: string;
  categories: Record<string, number>;
  total: number;
}

export interface PeriodRow {
  period: string;
  categories: Record<string, number>;
  total: number;
}

/**
 * Groups transactions by the given granularity and sums absolute amounts per category.
 * 'day' groups by YYYY-MM-DD, 'month' groups by YYYY-MM.
 * Returns rows sorted chronologically.
 */
export function aggregateByPeriod(
  transactions: MergedTransaction[],
  granularity: 'day' | 'month',
): PeriodRow[] {
  const map = new Map<string, Record<string, number>>();

  for (const txn of transactions) {
    const period =
      granularity === 'day' ? txn.date.slice(0, 10) : txn.date.slice(0, 7);
    if (!map.has(period)) map.set(period, {});
    const cats = map.get(period)!;
    const cat = txn.category ?? 'Uncategorized';
    cats[cat] = (cats[cat] ?? 0) + Math.abs(txn.amount);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, categories]) => ({
      period,
      categories,
      total: Object.values(categories).reduce((sum, v) => sum + v, 0),
    }));
}

/**
 * Groups transactions by YYYY-MM and sums absolute amounts per category.
 * Returns rows sorted chronologically.
 */
export function aggregateByMonth(
  transactions: MergedTransaction[],
): MonthlyRow[] {
  const map = new Map<string, Record<string, number>>();

  for (const txn of transactions) {
    const month = txn.date.slice(0, 7);
    if (!map.has(month)) map.set(month, {});
    const cats = map.get(month)!;
    const cat = txn.category ?? 'Uncategorized';
    cats[cat] = (cats[cat] ?? 0) + Math.abs(txn.amount);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, categories]) => ({
      month,
      categories,
      total: Object.values(categories).reduce((sum, v) => sum + v, 0),
    }));
}

/**
 * Sums credits from corporate bank accounts grouped by YYYY-MM.
 * Corporate accounts: `icici-corporate`, `idfc-corporate`.
 */
export function computeIncome(
  transactions: MergedTransaction[],
): Record<string, number> {
  const corporateBanks = new Set(['icici-corporate', 'idfc-corporate']);
  const result: Record<string, number> = {};

  for (const txn of transactions) {
    if (txn.amount <= 0) continue;
    if (!txn.bank || !corporateBanks.has(txn.bank)) continue;
    const month = txn.date.slice(0, 7);
    result[month] = (result[month] ?? 0) + txn.amount;
  }

  return result;
}

/**
 * Excludes ignored transactions and verified transfers from the dataset.
 * A verified transfer is one where `is_transfer === true` and `verified === true`.
 */
export function filterForAnalysis(
  merged: MergedTransaction[],
): MergedTransaction[] {
  return merged.filter((txn) => {
    if (txn.cancelled_by) return false;
    if (txn.ignore === true) return false;
    if (txn.is_transfer === true && txn.verified === true) return false;
    return true;
  });
}

/** Returns unique category values from the dataset, sorted alphabetically. */
export function extractCategories(transactions: MergedTransaction[]): string[] {
  const cats = new Set<string>();
  for (const txn of transactions) {
    if (txn.category) cats.add(txn.category);
  }
  return [...cats].sort((a, b) => a.localeCompare(b));
}
