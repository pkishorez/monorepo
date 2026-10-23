import { Schema } from 'effect';

/*
 * The accounts list: every signed-in Account, which one is active, and
 * whose Pocket is shown.
 *
 * The shown Account is the active one unless another was picked. A pick
 * holds through a switch, and goes when that Account becomes the active
 * one or signs out, so the list falls back to the active Account.
 */

const Account = Schema.Struct({ id: Schema.String, email: Schema.String });

export const Caller = Schema.TaggedUnion({
  Checking: {},
  SignedOut: {},
  SignedIn: { active: Schema.String, accounts: Schema.Array(Account) },
});

export type Caller = typeof Caller.Type;

/** Who is signed in, as the accounts list keeps it. */
export const signedIn = ({
  account,
}: {
  readonly account:
    | { readonly _tag: 'Checking' | 'SignedOut' }
    | {
        readonly _tag: 'SignedIn';
        readonly active: { readonly id: string };
        readonly accounts: ReadonlyArray<typeof Account.Type>;
      };
}): Caller =>
  account._tag === 'SignedIn'
    ? {
        _tag: 'SignedIn',
        active: account.active.id,
        accounts: account.accounts.map(({ id, email }) => ({ id, email })),
      }
    : { _tag: account._tag };

interface Picking {
  readonly caller: Caller;
  /** The Account picked to show, other than the active one. */
  readonly picked: string | null;
}

/** Whose Pocket is shown: the one picked, or the active one. */
export const shown = ({ caller, picked }: Picking) =>
  caller._tag === 'SignedIn' ? (picked ?? caller.active) : null;

/** Who is signed in changed: a pick holds while it is signed in and not active. */
export const follow = ({ picked }: Picking, caller: Caller): Picking => ({
  caller,
  picked:
    caller._tag === 'SignedIn' &&
    picked !== caller.active &&
    caller.accounts.some(({ id }) => id === picked)
      ? picked
      : null,
});

/** Shows `account`'s Pocket; the active one's is the default. */
export const show = (model: Picking, account: string): Picking =>
  follow({ ...model, picked: account }, model.caller);
