import { describe, expect, it } from 'vitest';
import {
  balances,
  byDay,
  centsOf,
  type Entry,
  monthsOf,
  sample,
  shiftMonth,
  summarize,
} from '../index.ts';

let n = 0;
const id = () => `id-${n++}`;
const draft = sample('u1', new Date(2026, 9, 5, 12), id);

const entry = (over: Partial<Entry>): Entry => ({
  id: id(),
  userId: 'u1',
  accountId: 'a',
  categoryId: 'c',
  cents: 100,
  way: 'out',
  memo: '',
  day: '2026-10-01',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('money', () => {
  it('reads typed money as cents, and anything else as none', () => {
    expect(centsOf('4.5')).toBe(450);
    expect(centsOf('12')).toBe(1200);
    expect(centsOf('0.05')).toBe(5);
    expect(centsOf('1.234')).toBe(0);
    expect(centsOf('abc')).toBe(0);
  });

  it('turns Months across a year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('sums each Account, in less out', () => {
    const by = balances(
      [{ id: 'a', userId: 'u1', name: 'A', kind: 'cash', createdAt: '' }],
      [entry({ cents: 1000, way: 'in' }), entry({ cents: 250 })],
    );
    expect(by.get('a')).toBe(750);
  });

  it('says where a Month went, the most first, and leaves other Months out', () => {
    const categories = [
      {
        id: 'food',
        userId: 'u1',
        name: 'Food',
        way: 'out',
        icon: 'utensils',
        budget: 0,
        createdAt: '',
      },
      {
        id: 'fun',
        userId: 'u1',
        name: 'Fun',
        way: 'out',
        icon: 'film',
        budget: 0,
        createdAt: '',
      },
    ] as const;
    const summary = summarize(
      '2026-10',
      [
        entry({ categoryId: 'food', cents: 300 }),
        entry({ categoryId: 'fun', cents: 900 }),
        entry({ categoryId: 'fun', cents: 5000, day: '2026-09-30' }),
        entry({ categoryId: 'food', cents: 2000, way: 'in' }),
      ],
      categories,
    );
    expect(summary).toMatchObject({ in: 2000, out: 1200 });
    expect(
      summary.spent.map((spend) => [spend.category.id, spend.cents]),
    ).toEqual([
      ['fun', 900],
      ['food', 300],
    ]);
  });

  it('groups Entries by day, newest first', () => {
    const days = byDay([
      entry({ day: '2026-10-01' }),
      entry({ day: '2026-10-03' }),
      entry({ day: '2026-10-01' }),
    ]);
    expect(days.map(([day, list]) => [day, list.length])).toEqual([
      ['2026-10-03', 1],
      ['2026-10-01', 2],
    ]);
  });
});

describe('sample', () => {
  it('gives every Entry an Account and a Category of the user', () => {
    const accounts = new Set(draft.accounts.map((account) => account.id));
    const categories = new Set(draft.categories.map((category) => category.id));
    expect(draft.entries.length).toBeGreaterThan(60);
    for (const each of draft.entries) {
      expect(accounts.has(each.accountId)).toBe(true);
      expect(categories.has(each.categoryId)).toBe(true);
      expect(each.userId).toBe('u1');
      expect(each.day <= '2026-10-05').toBe(true);
    }
  });

  it('spans three Months up to now', () => {
    expect(
      monthsOf(draft.entries, draft.categories).map((m) => m.month),
    ).toEqual(['2026-10', '2026-09', '2026-08']);
  });

  it('is the same for the same user', () => {
    let m = 0;
    const again = sample('u1', new Date(2026, 9, 5, 12), () => `id-${m++}`);
    expect(again.entries.map((each) => each.cents)).toEqual(
      draft.entries.map((each) => each.cents),
    );
  });
});
