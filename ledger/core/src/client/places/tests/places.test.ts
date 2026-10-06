import { describe, expect, it } from 'vitest';
import { stopsFrom } from '../places.ts';

const ACCOUNTS = [
  { id: 'cash', name: 'Cash', kind: 'cash' as const },
  { id: 'bank', name: 'Bank', kind: 'bank' as const },
];

const ids = (
  pathname: string,
  more: { tab?: string; account?: string; accounts?: typeof ACCOUNTS } = {},
) => {
  const { tree, start } = stopsFrom({ pathname, accounts: [], ...more });
  return { order: tree.map((stop) => stop.id), start };
};

describe('the stops of a Thumb Lock', () => {
  it('Steps from a Place through every Place', () => {
    expect(ids('/months')).toEqual({
      order: ['home', 'entries', 'months', 'settings'],
      start: ['months'],
    });
    expect(ids('/')).toMatchObject({ start: ['home'] });
  });

  it('puts an Entry or a Month just under its list', () => {
    expect(ids('/entries/abc')).toEqual({
      order: ['home', 'entries', 'entry', 'months', 'settings'],
      start: ['entry'],
    });
    expect(ids('/months/2026-10')).toEqual({
      order: ['home', 'entries', 'months', 'month', 'settings'],
      start: ['month'],
    });
  });

  it('puts the Accounts before Settings, only when there are any', () => {
    const { tree } = stopsFrom({ pathname: '/', accounts: ACCOUNTS });
    expect(tree.map((stop) => stop.id)).toEqual([
      'home',
      'entries',
      'months',
      'accounts',
      'settings',
    ]);
    expect(tree[3]?.children?.map((stop) => stop.account)).toEqual([
      'cash',
      'bank',
    ]);
  });

  it('starts on the Section or the Account you are on', () => {
    expect(ids('/settings').start).toEqual(['settings', 'general']);
    expect(ids('/settings', { tab: 'keys' }).start).toEqual([
      'settings',
      'keys',
    ]);
    expect(
      ids('/entries', { account: 'bank', accounts: ACCOUNTS }).start,
    ).toEqual(['accounts', 'bank']);
    expect(ids('/entries', { account: 'gone' }).start).toEqual(['entries']);
  });
});
