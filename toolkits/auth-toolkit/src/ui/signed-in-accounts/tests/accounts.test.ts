import { describe, expect, it } from 'vitest';

import { arrangeAccounts } from '../accounts.js';

const ada = { id: 'u-ada', name: 'Ada', email: 'ada@example.com' };
const mary = { id: 'u-mary', name: 'Mary', email: 'mary@example.com' };
const record = (user: typeof ada, token: string) => ({
  user,
  session: { id: `s-${token}`, token },
});

describe('arrangeAccounts', () => {
  it('puts the Active Account first and the rest under others', () => {
    const accounts = arrangeAccounts(
      [record(mary, 't-mary'), record(ada, 't-ada')],
      record(ada, 't-ada'),
      5,
    );
    expect(accounts.active.id).toBe('u-ada');
    expect(accounts.others.map((account) => account.id)).toEqual(['u-mary']);
    expect(accounts.tokens).toEqual({ 'u-ada': 't-ada', 'u-mary': 't-mary' });
  });

  it('still shows an Active Account whose Session predates the account list', () => {
    const accounts = arrangeAccounts([], record(ada, 't-ada'), 5);
    expect(accounts.active.id).toBe('u-ada');
    expect(accounts.others).toEqual([]);
    expect(accounts.canAdd).toBe(true);
  });

  it('stops offering to add accounts at the limit', () => {
    const accounts = arrangeAccounts(
      [record(mary, 't-mary'), record(ada, 't-ada')],
      record(ada, 't-ada'),
      2,
    );
    expect(accounts.canAdd).toBe(false);
  });
});
