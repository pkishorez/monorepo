import { describe, expect, it } from 'vitest';
import {
  type Account,
  type Category,
  type Entry,
  shiftDay,
} from '../../model/index.ts';
import {
  entryAt,
  firstAccount,
  glance,
  markAfterRemoving,
  monthView,
  monthsView,
  narrowedTo,
  narrowing,
  shownBy,
  validateEntriesSearch,
} from '../index.ts';

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

describe('the views of the Places', () => {
  it('reads an Entries search, dropping what is not one', () => {
    expect(
      validateEntriesSearch({
        month: '2026-13',
        account: 'cash',
        x: 1,
        at: '',
      }),
    ).toEqual({ account: 'cash' });
  });

  it('shows the Entries a search narrows to, and says the narrowing', () => {
    const search = { account: 'card', month: '2026-03', at: 'b' };
    expect(shownBy(money.entries, search).map((e) => e.id)).toEqual(['b']);
    expect(narrowedTo(money, search)).toMatch(/^card · /);
    expect(narrowing(search)).toEqual({ account: 'card', month: '2026-03' });
    expect(narrowedTo(money, {})).toBeUndefined();
  });

  it('places an Entry among those shown, with the ones beside it', () => {
    const at = entryAt(money.entries, {}, 'b');
    expect(at.position).toBe('2 of 3');
    expect([at.previous?.id, at.next?.id]).toEqual(['a', 'c']);
    const away = entryAt(money.entries, { account: 'card' }, 'a');
    expect(away.entry?.id).toBe('a');
    expect(away.position).toBeUndefined();
  });

  it('moves the mark off a removed Entry, to the next, else the one before', () => {
    const [a, b, c] = money.entries as [Entry, Entry, Entry];
    expect(markAfterRemoving(money.entries, a, 'a')).toBe('b');
    expect(markAfterRemoving(money.entries, c, 'c')).toBe('b');
    expect(markAfterRemoving(money.entries, b, 'a')).toBe('a');
    expect(markAfterRemoving([a], a, 'a')).toBe('a');
  });

  it('glances at a Month: left, Budgets fullest first, the latest', () => {
    const view = glance(money, '2026-03');
    expect(view.left).toBe(-400);
    expect(view.budgets.map((b) => b.category.id)).toEqual(['fun', 'food']);
    expect(view.recent).toHaveLength(3);
    expect(view.most).toBe(400);
  });

  it('turns a Month no earlier than the first Entry and spends by day', () => {
    const view = monthView(money, '2026-03');
    expect(view.hasEarlier).toBe(true);
    expect(view.days).toHaveLength(31);
    expect(view.days[11]).toBe(300);
    expect(view.peak).toBe(300);
    expect(monthView(money, '2026-02').hasEarlier).toBe(false);
  });

  it('lists the Months newest first, with the most of any', () => {
    const view = monthsView(money);
    expect(view.months.map((m) => m.month)).toEqual(['2026-03', '2026-02']);
    expect(view.most).toBe(5000);
  });

  it('starts a new Entry on a card, else the first Account', () => {
    expect(firstAccount(money.accounts)).toBe('card');
    expect(firstAccount([account('x', 'bank')])).toBe('x');
    expect(firstAccount([])).toBe('');
  });

  it('shifts a day across a month', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});
