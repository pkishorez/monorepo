import { describe, expect, it } from 'vitest';

import type { MergedTransaction } from '@/domain/merged-transaction.js';
import {
  filterByTriageTab,
  filterCancelled,
  groupCancelledPairs,
  computeMatchablePairs,
} from '../triage.js';

function makeTxn(
  overrides: Partial<MergedTransaction> & { id: string },
): MergedTransaction {
  return {
    date: '2024-03-15',
    owner: 'tester',
    bank: 'test-bank',
    description: 'test transaction',
    amount: -1000,
    type: 'debit',
    category: 'misc',
    subcategory: 'misc',
    is_transfer: false,
    ...overrides,
  };
}

describe('filterByTriageTab: all', () => {
  it('excludes transactions with cancelled_by set', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1' }),
      makeTxn({ id: 'tx2', cancelled_by: 'tx3' }),
      makeTxn({ id: 'tx3', cancelled_by: 'tx2' }),
    ];

    const result = filterByTriageTab(txns, 'all');

    expect(result.map((t) => t.id)).toEqual(['tx1']);
  });
});

describe('filterByTriageTab: unresolved', () => {
  it('returns only transactions that are not verified, not ignored, and not cancelled', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'unresolved' }),
      makeTxn({ id: 'verified', verified: true }),
      makeTxn({ id: 'ignored', ignore: true }),
      makeTxn({ id: 'cancelled', cancelled_by: 'other' }),
    ];

    const result = filterByTriageTab(txns, 'unresolved');

    expect(result.map((t) => t.id)).toEqual(['unresolved']);
  });
});

describe('filterByTriageTab: resolved', () => {
  it('returns only transactions with verified true and no cancelled_by', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'unresolved' }),
      makeTxn({ id: 'verified', verified: true }),
      makeTxn({ id: 'verified-cancelled', verified: true, cancelled_by: 'x' }),
    ];

    const result = filterByTriageTab(txns, 'resolved');

    expect(result.map((t) => t.id)).toEqual(['verified']);
  });
});

describe('filterByTriageTab: ignored', () => {
  it('returns only transactions with ignore true and no cancelled_by', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'unresolved' }),
      makeTxn({ id: 'ignored', ignore: true }),
      makeTxn({ id: 'ignored-cancelled', ignore: true, cancelled_by: 'x' }),
    ];

    const result = filterByTriageTab(txns, 'ignored');

    expect(result.map((t) => t.id)).toEqual(['ignored']);
  });
});

describe('filterCancelled', () => {
  it('returns only transactions with cancelled_by set', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'normal' }),
      makeTxn({ id: 'cancelled-a', cancelled_by: 'cancelled-b' }),
      makeTxn({ id: 'cancelled-b', cancelled_by: 'cancelled-a' }),
    ];

    const result = filterCancelled(txns);

    expect(result.map((t) => t.id)).toEqual(['cancelled-a', 'cancelled-b']);
  });

  it('returns empty array when no transactions are cancelled', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1' }),
      makeTxn({ id: 'tx2', verified: true }),
    ];

    expect(filterCancelled(txns)).toHaveLength(0);
  });
});

describe('groupCancelledPairs', () => {
  it('groups paired cancelled transactions into pair groups', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'a', cancelled_by: 'b' }),
      makeTxn({ id: 'c' }),
      makeTxn({ id: 'b', cancelled_by: 'a' }),
    ];

    const result = groupCancelledPairs(txns);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('pair');
    expect(result[0]!.transactions.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('appends orphans after pairs', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'orphan', cancelled_by: 'missing' }),
      makeTxn({ id: 'a', cancelled_by: 'b' }),
      makeTxn({ id: 'b', cancelled_by: 'a' }),
    ];

    const result = groupCancelledPairs(txns);

    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('pair');
    expect(result[0]!.transactions.map((t) => t.id)).toEqual(['a', 'b']);
    expect(result[1]!.type).toBe('orphan');
    expect(result[1]!.transactions.map((t) => t.id)).toEqual(['orphan']);
  });

  it('returns empty array when no cancelled transactions', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1' }),
      makeTxn({ id: 'tx2' }),
    ];

    expect(groupCancelledPairs(txns)).toHaveLength(0);
  });

  it('handles multiple pairs', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'a', cancelled_by: 'b' }),
      makeTxn({ id: 'b', cancelled_by: 'a' }),
      makeTxn({ id: 'c', cancelled_by: 'd' }),
      makeTxn({ id: 'd', cancelled_by: 'c' }),
    ];

    const result = groupCancelledPairs(txns);

    expect(result).toHaveLength(2);
    expect(result[0]!.transactions.map((t) => t.id)).toEqual(['a', 'b']);
    expect(result[1]!.transactions.map((t) => t.id)).toEqual(['c', 'd']);
  });
});

describe('computeMatchablePairs', () => {
  it('excludes groups that have only debits and no credits', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'debit1', amount: -1000 }),
      makeTxn({ id: 'debit2', amount: -1000 }),
    ];

    const result = computeMatchablePairs(txns);

    expect(result.size).toBe(0);
  });

  it('excludes groups that have only credits and no debits', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'credit1', amount: 500 }),
      makeTxn({ id: 'credit2', amount: 500 }),
    ];

    const result = computeMatchablePairs(txns);

    expect(result.size).toBe(0);
  });

  it('includes groups with at least one credit and one debit', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'debit', amount: -1000 }),
      makeTxn({ id: 'credit', amount: 1000 }),
    ];

    const result = computeMatchablePairs(txns);

    expect(result.size).toBe(1);
    expect(result.get(1000)?.map((t) => t.id)).toContain('debit');
    expect(result.get(1000)?.map((t) => t.id)).toContain('credit');
  });

  it('excludes cancelled transactions from grouping', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'debit', amount: -1000 }),
      makeTxn({ id: 'credit-cancelled', amount: 1000, cancelled_by: 'other' }),
    ];

    const result = computeMatchablePairs(txns);

    expect(result.size).toBe(0);
  });

  it('sorts by date ascending within each group', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'march', amount: -500, date: '2024-03-15' }),
      makeTxn({ id: 'january', amount: 500, date: '2024-01-10' }),
      makeTxn({ id: 'february', amount: -500, date: '2024-02-20' }),
    ];

    const result = computeMatchablePairs(txns);
    const group = result.get(500)!;

    expect(group.map((t) => t.id)).toEqual(['january', 'february', 'march']);
  });

  it('returns groups sorted descending by absolute amount', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'small-debit', amount: -100 }),
      makeTxn({ id: 'small-credit', amount: 100 }),
      makeTxn({ id: 'large-debit', amount: -5000 }),
      makeTxn({ id: 'large-credit', amount: 5000 }),
    ];

    const result = computeMatchablePairs(txns);
    const keys = [...result.keys()];

    expect(keys).toEqual([5000, 100]);
  });
});
