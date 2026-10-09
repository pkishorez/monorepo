import { describe, expect, it } from 'vitest';
import { type Account, type Entry, shiftDay } from '../../model/index.ts';
import {
  firstAccount,
  markAfterRemoving,
  narrowing,
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

const money = {
  accounts: [account('cash', 'cash'), account('card', 'card')],
  entries: [
    entry('a', { day: '2026-03-12', categoryId: 'fun', cents: 300 }),
    entry('b', { day: '2026-03-10', accountId: 'card' }),
    entry('c', { day: '2026-02-01', way: 'in', cents: 5000 }),
  ],
};

describe('the addresses of the Places', () => {
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

  it('keeps the narrowing of a search without its mark', () => {
    const search = { account: 'card', month: '2026-03', at: 'b' };
    expect(narrowing(search)).toEqual({ account: 'card', month: '2026-03' });
  });

  it('moves the mark off a removed Entry, to the next, else the one before', () => {
    const [a, b, c] = money.entries as [Entry, Entry, Entry];
    expect(markAfterRemoving(money.entries, a, 'a')).toBe('b');
    expect(markAfterRemoving(money.entries, c, 'c')).toBe('b');
    expect(markAfterRemoving(money.entries, b, 'a')).toBe('a');
    expect(markAfterRemoving([a], a, 'a')).toBe('a');
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
