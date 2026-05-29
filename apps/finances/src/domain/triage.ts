import type { MergedTransaction } from './merged-transaction.js';

type TriageTab = 'all' | 'unresolved' | 'resolved' | 'ignored';

/**
 * Filters transactions for the given triage tab.
 * All tabs exclude cancelled transactions (`cancelled_by` is set).
 */
export function filterByTriageTab(
  transactions: readonly MergedTransaction[],
  tab: TriageTab,
): MergedTransaction[] {
  if (tab === 'all') {
    return transactions.filter((t) => !t.cancelled_by);
  }
  if (tab === 'unresolved') {
    return transactions.filter(
      (t) => !t.verified && !t.ignore && !t.cancelled_by,
    );
  }
  if (tab === 'resolved') {
    return transactions.filter((t) => t.verified === true && !t.cancelled_by);
  }
  // tab === 'ignored'
  return transactions.filter((t) => t.ignore === true && !t.cancelled_by);
}

/**
 * Returns only transactions where `cancelled_by` is set.
 * Used to populate the Cancelled tab.
 */
export function filterCancelled(
  transactions: readonly MergedTransaction[],
): MergedTransaction[] {
  return transactions.filter((t) => Boolean(t.cancelled_by));
}

export interface CancelledGroup {
  type: 'pair' | 'orphan';
  transactions: [MergedTransaction, MergedTransaction] | [MergedTransaction];
}

/**
 * Groups cancelled transactions into pairs by matching `cancelled_by` IDs.
 * Returns structured groups: paired transactions and orphans (partner missing).
 */
export function groupCancelledPairs(
  transactions: readonly MergedTransaction[],
): CancelledGroup[] {
  const cancelled = transactions.filter((t) => Boolean(t.cancelled_by));
  const byId = new Map(cancelled.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const groups: CancelledGroup[] = [];
  const orphans: CancelledGroup[] = [];

  for (const t of cancelled) {
    if (visited.has(t.id)) continue;
    visited.add(t.id);
    const partner = t.cancelled_by ? byId.get(t.cancelled_by) : undefined;
    if (partner && !visited.has(partner.id)) {
      visited.add(partner.id);
      groups.push({ type: 'pair', transactions: [t, partner] });
    } else {
      orphans.push({ type: 'orphan', transactions: [t] });
    }
  }

  return [...groups, ...orphans];
}

/**
 * Groups non-cancelled transactions by absolute amount, keeping only groups
 * that contain at least one credit (amount > 0) AND one debit (amount < 0).
 * Within each group, transactions are sorted by date ascending.
 * Returns a Map keyed by absolute amount, sorted descending.
 */
export function computeMatchablePairs(
  transactions: readonly MergedTransaction[],
): Map<number, MergedTransaction[]> {
  const groups = new Map<number, MergedTransaction[]>();

  for (const t of transactions) {
    if (t.cancelled_by || t.verified || t.ignore) continue;
    const absAmount = Math.abs(t.amount);
    const existing = groups.get(absAmount);
    if (existing) existing.push(t);
    else groups.set(absAmount, [t]);
  }

  const matchable = new Map<number, MergedTransaction[]>();
  for (const [amount, group] of groups) {
    const hasCredit = group.some((t) => t.amount > 0);
    const hasDebit = group.some((t) => t.amount < 0);
    if (!hasCredit || !hasDebit) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    matchable.set(amount, sorted);
  }

  return new Map([...matchable.entries()].sort(([a], [b]) => b - a));
}
