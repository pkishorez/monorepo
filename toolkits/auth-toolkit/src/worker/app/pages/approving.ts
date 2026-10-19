import type { Account } from '../api/index.ts';

interface Choice {
  readonly accounts: ReadonlyArray<Account>;
  readonly active: string | null;
  /** The Account picked on the page, if one was. */
  readonly chosen: string | null;
  /** Approving as another Account than the hinted one, which is not here. */
  readonly overrode?: boolean;
}

/**
 * The Approving Account: the one picked on the page, else the hinted one
 * if it is signed in here, else the Active Account. `missing` is a hinted
 * Account that is not signed in here, unless another was chosen in its
 * place. Picking switches nothing.
 */
export const approving = (choice: Choice, hint?: string) => {
  const hinted = hint
    ? choice.accounts.find(
        (account) => account.email.toLowerCase() === hint.toLowerCase(),
      )
    : undefined;
  const chosen =
    choice.accounts.find((account) => account.id === choice.chosen) ??
    hinted ??
    choice.accounts.find((account) => account.id === choice.active) ??
    choice.accounts[0];
  return {
    chosen,
    missing: hint && !hinted && !choice.overrode ? hint : undefined,
  };
};
