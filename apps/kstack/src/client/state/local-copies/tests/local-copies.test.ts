import { describe, expect, it } from 'vitest';
import { copyName, reconcileCopies } from '../local-copies.ts';

const storeOf = (names: string[]) => {
  const removed: string[] = [];
  return {
    removed,
    store: {
      list: async () => names.map((name) => ({ name })),
      remove: async (name: string) => {
        removed.push(name);
      },
    },
  };
};

describe('local copies', () => {
  it('names a copy the way Std Sync stores it', () => {
    expect(copyName('AbC_12')).toBe('user-abc-12');
  });

  it('keeps every signed-in User and deletes every other', async () => {
    const { store, removed } = storeOf([
      copyName('Ada'),
      copyName('Mary'),
      copyName('Gone'),
    ]);
    expect(await reconcileCopies(['Ada', 'Mary'], store)).toEqual([
      'user-gone',
    ]);
    expect(removed).toEqual(['user-gone']);
  });

  it('deletes copies under the old name, and nothing it does not own', async () => {
    const { store, removed } = storeOf(['ledger-ada', 'device', 'other']);
    await reconcileCopies(['ada'], store);
    expect(removed).toEqual(['ledger-ada']);
  });

  it('deletes every copy when nobody is signed in', async () => {
    const { store, removed } = storeOf([copyName('a'), copyName('b')]);
    await reconcileCopies([], store);
    expect(removed).toEqual(['user-a', 'user-b']);
  });
});
