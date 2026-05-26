import { describe, expect, it } from 'vitest';

import {
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

describe('triage: filterUnverified', () => {
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

  it('treats undefined verified as unverified', () => {
    const merged: MergedTransaction[] = [makeTxn({ id: 'tx1' })];

    expect(filterUnverified(merged)).toHaveLength(1);
  });
});

describe('triage: sortByAmountDesc', () => {
  it('sorts by Math.abs(amount) descending', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'small', amount: -100 }),
      makeTxn({ id: 'large-debit', amount: -50000 }),
      makeTxn({ id: 'medium-credit', amount: 10000 }),
    ];

    const result = sortByAmountDesc(merged);

    expect(result.map((t) => t.id)).toEqual([
      'large-debit',
      'medium-credit',
      'small',
    ]);
  });

  it('handles equal amounts stably', () => {
    const merged: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -500 }),
      makeTxn({ id: 'tx2', amount: 500 }),
    ];

    const result = sortByAmountDesc(merged);

    expect(result).toHaveLength(2);
    expect(Math.abs(result[0]!.amount)).toBe(500);
  });
});

describe('triage: computeCoverage', () => {
  it('calculates correct percentage of verified debits', () => {
    const debits: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -3000, verified: true }),
      makeTxn({ id: 'tx2', amount: -7000 }),
    ];

    const result = computeCoverage(debits);

    expect(result.verified).toBe(3000);
    expect(result.total).toBe(10000);
    expect(result.percentage).toBe(30);
  });

  it('returns 0% for empty input', () => {
    const result = computeCoverage([]);

    expect(result).toEqual({ verified: 0, total: 0, percentage: 0 });
  });

  it('rounds percentage to nearest integer', () => {
    const debits: MergedTransaction[] = [
      makeTxn({ id: 'tx1', amount: -1, verified: true }),
      makeTxn({ id: 'tx2', amount: -2 }),
    ];

    const result = computeCoverage(debits);

    expect(result.percentage).toBe(33);
  });
});
