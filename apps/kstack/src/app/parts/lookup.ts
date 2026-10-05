import { useMemo } from 'react';
import type { Money } from '../../client/data/index.ts';

/** The user's Accounts and Categories by id. */
export const useLookup = (money: Money) =>
  useMemo(
    () => ({
      account: new Map(money.accounts.map((account) => [account.id, account])),
      category: new Map(
        money.categories.map((category) => [category.id, category]),
      ),
    }),
    [money.accounts, money.categories],
  );
