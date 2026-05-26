import { describe, expect, it } from 'vitest';

import {
  mergeTransactionsWithOverrides,
  filterUnverified,
  sortByAmountDesc,
  computeCoverage,
  type MergedTransaction,
} from '../index.js';

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

function makeOverride(
  transactionId: string,
  overrides: {
    category?: string;
    subcategory?: string;
    notes?: string;
    verified?: boolean;
    ignore?: boolean;
    cancelled_by?: string | null;
  } = {},
) {
  return {
    transactionId,
    category: overrides.category ?? 'food',
    subcategory: overrides.subcategory ?? 'restaurant',
    verified: overrides.verified ?? false,
    ignore: overrides.ignore ?? false,
    ...(overrides.notes !== undefined ? { notes: overrides.notes } : {}),
    cancelled_by: overrides.cancelled_by ?? null,
  };
}

describe('mergeTransactionsWithOverrides', () => {
  it('overwrites category, subcategory, and notes from override', () => {
    const txns = [
      makeTxn({
        id: 'tx1',
        category: 'misc',
        subcategory: 'other',
        notes: 'old',
      }),
    ];
    const overrides = [
      makeOverride('tx1', {
        category: 'food',
        subcategory: 'restaurant',
        notes: 'updated',
      }),
    ];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('food');
    expect(result[0]!.subcategory).toBe('restaurant');
    expect(result[0]!.notes).toBe('updated');
  });

  it('passes through unmatched transactions unchanged', () => {
    const txns = [
      makeTxn({ id: 'tx1', category: 'travel' }),
      makeTxn({ id: 'tx2', category: 'food' }),
    ];
    const overrides = [makeOverride('tx1', { category: 'shopping' })];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result).toHaveLength(2);
    expect(result[0]!.category).toBe('shopping');
    expect(result[1]!.category).toBe('food');
  });

  it('attaches verified and ignore flags from override', () => {
    const txns = [makeTxn({ id: 'tx1' })];
    const overrides = [makeOverride('tx1', { verified: true, ignore: true })];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result[0]!.verified).toBe(true);
    expect(result[0]!.ignore).toBe(true);
  });

  it('handles partial override where subcategory is empty string', () => {
    const txns = [
      makeTxn({ id: 'tx1', category: 'misc', subcategory: 'specific' }),
    ];
    const overrides = [
      makeOverride('tx1', { category: 'food', subcategory: '' }),
    ];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result[0]!.category).toBe('food');
    expect(result[0]!.subcategory).toBe('');
  });

  it('returns empty array for empty input', () => {
    expect(mergeTransactionsWithOverrides([], [])).toEqual([]);
  });

  it('does not attach notes when override has no notes field', () => {
    const txns = [makeTxn({ id: 'tx1', notes: 'original' })];
    const overrides = [makeOverride('tx1')];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result[0]!.notes).toBe('original');
  });

  it('spreads cancelled_by from override onto merged transaction', () => {
    const txns = [makeTxn({ id: 'tx1' })];
    const overrides = [makeOverride('tx1', { cancelled_by: 'tx2' })];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result[0]!.cancelled_by).toBe('tx2');
  });

  it('spreads cancelled_by: null from override when not cancelled', () => {
    const txns = [makeTxn({ id: 'tx1' })];
    const overrides = [makeOverride('tx1')];

    const result = mergeTransactionsWithOverrides(txns, overrides);

    expect(result[0]!.cancelled_by).toBeNull();
  });
});

describe('filterUnverified', () => {
  it('returns only transactions without verified: true', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'tx1', verified: true }),
      makeTxn({ id: 'tx2', verified: false }),
      makeTxn({ id: 'tx3' }),
    ];

    const result = filterUnverified(merged);

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['tx2', 'tx3']);
  });

  it('returns all when none are verified', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'tx1' }),
      makeTxn({ id: 'tx2' }),
    ];

    expect(filterUnverified(merged)).toHaveLength(2);
  });

  it('returns empty when all are verified', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'tx1', verified: true }),
    ];

    expect(filterUnverified(merged)).toHaveLength(0);
  });
});

describe('sortByAmountDesc', () => {
  it('sorts by absolute amount descending', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: 100 }),
      makeTxn({ id: 'tx2', amount: -50000 }),
      makeTxn({ id: 'tx3', amount: 10000 }),
    ];

    const result = sortByAmountDesc(merged);

    expect(result.map((t) => t.id)).toEqual(['tx2', 'tx3', 'tx1']);
  });

  it('a -50000 debit sorts before a 10000 credit', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'credit', amount: 10000 }),
      makeTxn({ id: 'debit', amount: -50000 }),
    ];

    const result = sortByAmountDesc(merged);

    expect(result[0]!.id).toBe('debit');
    expect(result[1]!.id).toBe('credit');
  });

  it('does not mutate the original array', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: 100 }),
      makeTxn({ id: 'tx2', amount: 200 }),
    ];

    sortByAmountDesc(merged);

    expect(merged[0]!.id).toBe('tx1');
  });
});

describe('computeCoverage', () => {
  it('calculates verified debit amount / total debit amount', () => {
    const debits: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -1000, verified: true }),
      makeTxn({ id: 'tx2', amount: -3000 }),
    ];

    const result = computeCoverage(debits);

    expect(result.verified).toBe(1000);
    expect(result.total).toBe(4000);
    expect(result.percentage).toBe(25);
  });

  it('returns 0% when no debits exist', () => {
    const result = computeCoverage([]);

    expect(result.verified).toBe(0);
    expect(result.total).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('returns 100% when all are verified', () => {
    const debits: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -500, verified: true }),
      makeTxn({ id: 'tx2', amount: -500, verified: true }),
    ];

    const result = computeCoverage(debits);

    expect(result.percentage).toBe(100);
  });

  it('excludes cancelled records from both verified and total', () => {
    const debits: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -1000, verified: true }),
      makeTxn({ id: 'tx2', amount: -3000, cancelled_by: 'tx3' }),
      makeTxn({
        id: 'tx3',
        amount: -2000,
        verified: true,
        cancelled_by: 'tx2',
      }),
    ];

    const result = computeCoverage(debits);

    expect(result.verified).toBe(1000);
    expect(result.total).toBe(1000);
    expect(result.percentage).toBe(100);
  });

  it('uses absolute amounts for calculation', () => {
    const debits: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -2000, verified: true }),
      makeTxn({ id: 'tx2', amount: -2000 }),
    ];

    const result = computeCoverage(debits);

    expect(result.verified).toBe(2000);
    expect(result.total).toBe(4000);
    expect(result.percentage).toBe(50);
  });
});
