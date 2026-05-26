import { describe, expect, it } from 'vitest';

import {
  aggregateByMonth,
  aggregateByPeriod,
  computeIncome,
  filterForAnalysis,
  extractCategories,
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

describe('aggregateByMonth', () => {
  it('groups by YYYY-MM and sums amounts per category', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-15',
        category: 'food',
        amount: -500,
      }),
      makeTxn({
        id: 'tx2',
        date: '2024-03-20',
        category: 'food',
        amount: -300,
      }),
      makeTxn({
        id: 'tx3',
        date: '2024-03-10',
        category: 'travel',
        amount: -200,
      }),
    ];

    const result = aggregateByMonth(txns);

    expect(result).toHaveLength(1);
    expect(result[0]!.month).toBe('2024-03');
    expect(result[0]!.categories['food']).toBe(800);
    expect(result[0]!.categories['travel']).toBe(200);
    expect(result[0]!.total).toBe(1000);
  });

  it('sorts months chronologically', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-05-01',
        category: 'food',
        amount: -100,
      }),
      makeTxn({
        id: 'tx2',
        date: '2024-01-01',
        category: 'food',
        amount: -100,
      }),
      makeTxn({
        id: 'tx3',
        date: '2024-03-01',
        category: 'food',
        amount: -100,
      }),
    ];

    const result = aggregateByMonth(txns);

    expect(result.map((r) => r.month)).toEqual([
      '2024-01',
      '2024-03',
      '2024-05',
    ]);
  });

  it('uses absolute amounts', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-15',
        category: 'food',
        amount: -500,
      }),
    ];

    const result = aggregateByMonth(txns);

    expect(result[0]!.categories['food']).toBe(500);
  });

  it('labels missing category as Uncategorized', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', date: '2024-03-15', amount: -100 }),
    ];

    const result = aggregateByMonth(txns);

    expect(result[0]!.categories['Uncategorized']).toBe(100);
  });

  it('returns empty for empty input', () => {
    expect(aggregateByMonth([])).toEqual([]);
  });
});

describe('aggregateByPeriod', () => {
  it('groups by day when granularity is "day"', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-15',
        category: 'food',
        amount: -500,
      }),
      makeTxn({
        id: 'tx2',
        date: '2024-03-15',
        category: 'food',
        amount: -300,
      }),
      makeTxn({
        id: 'tx3',
        date: '2024-03-16',
        category: 'travel',
        amount: -200,
      }),
    ];

    const result = aggregateByPeriod(txns, 'day');

    expect(result).toHaveLength(2);
    expect(result[0]!.period).toBe('2024-03-15');
    expect(result[0]!.categories['food']).toBe(800);
    expect(result[0]!.total).toBe(800);
    expect(result[1]!.period).toBe('2024-03-16');
    expect(result[1]!.categories['travel']).toBe(200);
    expect(result[1]!.total).toBe(200);
  });

  it('groups by month when granularity is "month"', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-15',
        category: 'food',
        amount: -500,
      }),
      makeTxn({
        id: 'tx2',
        date: '2024-03-20',
        category: 'food',
        amount: -300,
      }),
      makeTxn({
        id: 'tx3',
        date: '2024-04-10',
        category: 'travel',
        amount: -200,
      }),
    ];

    const result = aggregateByPeriod(txns, 'month');

    expect(result).toHaveLength(2);
    expect(result[0]!.period).toBe('2024-03');
    expect(result[0]!.categories['food']).toBe(800);
    expect(result[1]!.period).toBe('2024-04');
    expect(result[1]!.categories['travel']).toBe(200);
  });

  it('sorts periods chronologically', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-20',
        category: 'food',
        amount: -100,
      }),
      makeTxn({
        id: 'tx2',
        date: '2024-03-05',
        category: 'food',
        amount: -100,
      }),
      makeTxn({
        id: 'tx3',
        date: '2024-03-10',
        category: 'food',
        amount: -100,
      }),
    ];

    const result = aggregateByPeriod(txns, 'day');

    expect(result.map((r) => r.period)).toEqual([
      '2024-03-05',
      '2024-03-10',
      '2024-03-20',
    ]);
  });

  it('uses absolute amounts', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-15',
        category: 'food',
        amount: -500,
      }),
    ];

    const result = aggregateByPeriod(txns, 'day');

    expect(result[0]!.categories['food']).toBe(500);
  });

  it('returns empty for empty input', () => {
    expect(aggregateByPeriod([], 'day')).toEqual([]);
    expect(aggregateByPeriod([], 'month')).toEqual([]);
  });
});

describe('computeIncome', () => {
  it('sums credits from corporate banks grouped by month', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-01',
        amount: 100000,
        bank: 'icici-corporate',
      }),
      makeTxn({
        id: 'tx2',
        date: '2024-03-15',
        amount: 50000,
        bank: 'idfc-corporate',
      }),
      makeTxn({
        id: 'tx3',
        date: '2024-04-01',
        amount: 120000,
        bank: 'icici-corporate',
      }),
    ];

    const result = computeIncome(txns);

    expect(result['2024-03']).toBe(150000);
    expect(result['2024-04']).toBe(120000);
  });

  it('ignores debits from corporate accounts', () => {
    const txns: MergedTransaction[] = [
      makeTxn({
        id: 'tx1',
        date: '2024-03-01',
        amount: -5000,
        bank: 'icici-corporate',
      }),
    ];

    const result = computeIncome(txns);

    expect(result).toEqual({});
  });

  it('ignores non-corporate accounts', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', date: '2024-03-01', amount: 5000, bank: 'hdfc' }),
      makeTxn({ id: 'tx2', date: '2024-03-01', amount: 5000 }),
    ];

    const result = computeIncome(txns);

    expect(result).toEqual({});
  });

  it('returns empty for empty input', () => {
    expect(computeIncome([])).toEqual({});
  });
});

describe('filterForAnalysis', () => {
  it('excludes transactions with ignore: true', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', ignore: true }),
      makeTxn({ id: 'tx2', ignore: false }),
      makeTxn({ id: 'tx3' }),
    ];

    const result = filterForAnalysis(txns);

    expect(result.map((t) => t.id)).toEqual(['tx2', 'tx3']);
  });

  it('excludes verified transfers', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', is_transfer: true, verified: true }),
    ];

    expect(filterForAnalysis(txns)).toHaveLength(0);
  });

  it('includes unverified transfers', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', is_transfer: true }),
      makeTxn({ id: 'tx2', is_transfer: true, verified: false }),
    ];

    const result = filterForAnalysis(txns);

    expect(result).toHaveLength(2);
  });

  it('includes non-transfer verified transactions', () => {
    const txns: MergedTransaction[] = [makeTxn({ id: 'tx1', verified: true })];

    expect(filterForAnalysis(txns)).toHaveLength(1);
  });

  it('excludes transactions with cancelled_by set', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', verified: true, cancelled_by: 'tx2' }),
      makeTxn({ id: 'tx2', cancelled_by: 'tx1' }),
      makeTxn({ id: 'tx3' }),
    ];

    const result = filterForAnalysis(txns);

    expect(result.map((t) => t.id)).toEqual(['tx3']);
  });
});

describe('extractCategories', () => {
  it('returns sorted unique category strings', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', category: 'travel' }),
      makeTxn({ id: 'tx2', category: 'food' }),
      makeTxn({ id: 'tx3', category: 'food' }),
      makeTxn({ id: 'tx4', category: 'bills' }),
    ];

    expect(extractCategories(txns)).toEqual(['bills', 'food', 'travel']);
  });

  it('excludes empty strings', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1', category: '' }),
      makeTxn({ id: 'tx2', category: 'food' }),
    ];

    expect(extractCategories(txns)).toEqual(['food']);
  });

  it('excludes undefined categories', () => {
    const txns: MergedTransaction[] = [
      makeTxn({ id: 'tx1' }),
      makeTxn({ id: 'tx2', category: 'food' }),
    ];

    expect(extractCategories(txns)).toEqual(['food']);
  });

  it('returns empty for empty input', () => {
    expect(extractCategories([])).toEqual([]);
  });
});
