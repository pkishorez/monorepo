import type { SignedInAccount } from 'kui-toolkit/components/blocks/auth';

import type { UserRecord } from '../client/index.js';

export interface AccountRecord {
  user: UserRecord;
  session: { id: string; token: string };
}

export interface Accounts {
  active: SignedInAccount;
  others: SignedInAccount[];
  canAdd: boolean;
  /** Session token per account id, for switching and signing out. */
  tokens: Record<string, string>;
}

const toAccount = ({ user }: { user: UserRecord }): SignedInAccount => ({
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
});

/** Arranges the browser's Signed-in Accounts around the Active Account.
 * The active User may be missing from the records when its cookie was set
 * before the plugin was enabled; it is still the Active Account. */
export const arrangeAccounts = (
  records: ReadonlyArray<AccountRecord>,
  active: { user: UserRecord; session: { token: string } },
  maximumAccounts: number,
): Accounts => {
  const others = records.filter((record) => record.user.id !== active.user.id);
  return {
    active: toAccount(active),
    others: others.map(toAccount),
    canAdd: others.length + 1 < maximumAccounts,
    tokens: Object.fromEntries([
      ...records.map((record) => [record.user.id, record.session.token]),
      [active.user.id, active.session.token],
    ]),
  };
};
