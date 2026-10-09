import { describe, expect, it } from 'vitest';
import { type Account, type Category, type Entry } from '../../model/index.ts';
import {
  daysOf,
  entryAt,
  glance,
  monthView,
  monthsView,
  narrowedTo,
} from '../views.ts';

const entry = (id: string, over: Partial<Entry> = {}): Entry => ({
  id,
  userId: 'u1',
  accountId: 'cash',
  categoryId: 'food',
  cents: 100,
  way: 'out',
  memo: '',
  day: '2026-03-10',
  createdAt: '2026-03-10T00:00:00.000Z',
  ...over,
});

const account = (id: string, kind: Account['kind']): Account =>
  ({ id, name: id, kind, userId: 'u1', createdAt: '' }) as Account;

const category = (id: string, budget: number): Category =>
  ({
    id,
    name: id,
    icon: 'utensils',
    way: 'out',
    budget,
    userId: 'u1',
    createdAt: '',
  }) as unknown as Category;

const money = {
  accounts: [account('cash', 'cash'), account('card', 'card')],
  categories: [category('food', 1000), category('fun', 200)],
  entries: [
    entry('a', { day: '2026-03-12', categoryId: 'fun', cents: 300 }),
    entry('b', { day: '2026-03-10', accountId: 'card' }),
    entry('c', { day: '2026-02-01', way: 'in', cents: 5000 }),
  ],
};

const lookup = {
  account: new Map(money.accounts.map((each) => [each.id, each])),
  category: new Map(money.categories.map((each) => [each.id, each])),
};

const march = money.entries.filter((each) => each.day.startsWith('2026-03'));

describe('what Queries work out from what they read', () => {
  it('says the narrowing of a search in words', () => {
    expect(narrowedTo(lookup, { account: 'card', month: '2026-03' })).toMatch(
      /^card · /,
    );
    expect(narrowedTo(lookup, {})).toBeUndefined();
  });

  it('places an Entry among those shown, with the ones beside it', () => {
    const at = entryAt(money.entries, undefined, 'b');
    expect(at.position).toBe('2 of 3');
    expect([at.previous?.id, at.next?.id]).toEqual(['a', 'c']);
    const cards = money.entries.filter((each) => each.accountId === 'card');
    const away = entryAt(cards, money.entries[0], 'a');
    expect(away.entry?.id).toBe('a');
    expect(away.position).toBeUndefined();
  });

  it('glances at a Month: left, Budgets fullest first, the latest', () => {
    const view = glance('2026-03', march, money.categories, money.entries);
    expect(view.left).toBe(-400);
    expect(view.budgets.map((b) => b.category.id)).toEqual(['fun', 'food']);
    expect(view.recent).toHaveLength(3);
    expect(view.most).toBe(400);
  });

  it('turns a Month no earlier than the oldest Entry and spends by day', () => {
    const oldest = money.entries.at(-1);
    const view = monthView('2026-03', march, money.categories, oldest);
    expect(view.hasEarlier).toBe(true);
    expect(view.days).toHaveLength(31);
    expect(view.days[11]).toBe(300);
    expect(view.peak).toBe(300);
    expect(monthView('2026-02', [], money.categories, oldest).hasEarlier).toBe(
      false,
    );
  });

  it('lists the Months newest first, with the most of any', () => {
    const view = monthsView(money.entries, money.categories);
    expect(view.months.map((m) => m.month)).toEqual(['2026-03', '2026-02']);
    expect(view.months.map((m) => m.left)).toEqual([-400, 5000]);
    expect(view.most).toBe(5000);
  });

  it('groups Entries by day, newest first, each with what it came to', () => {
    const days = daysOf(money.entries);
    expect(days.map((each) => [each.day, each.net])).toEqual([
      ['2026-03-12', -300],
      ['2026-03-10', -100],
      ['2026-02-01', 5000],
    ]);
  });
});
