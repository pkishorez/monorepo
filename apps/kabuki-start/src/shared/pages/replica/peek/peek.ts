import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { CurrentAccount } from '@kestack/web-platform/account-switcher';
import { about } from '../../metadata/index.ts';
import { Entries, Wallets } from '../pocket/index.ts';

/*
 * Peek: another signed-in Account's Pocket, read from this device. Its
 * Instance runs while Peek reads it, with its Gate closed, since the
 * cookie is the active Account's: it shows what was kept here when that
 * Account was last the active one, and fetches nothing. No writes here.
 */

const Other = Schema.Struct({ id: Schema.String, email: Schema.String });

export const Peek = Page.define({
  path: '/peek',
  requires: [CurrentAccount],
  metadata: about(
    '/replica/peek',
    'Peek',
    "Another account's Pocket, read from this device.",
  ),
  model: Schema.Struct({
    /** The signed-in Accounts that are not the active one. */
    others: Schema.Array(Other),
    picked: Schema.NullOr(Schema.String),
    selected: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Accounts: { others: Schema.Array(Other) },
    Pick: { account: Schema.String },
    Select: { wallet: Schema.String },
  }),
});

export const PeekLive = Page.build(Peek, {
  init: () => ({ model: { others: [], picked: null, selected: null } }),
  workers: {
    account: {
      run: (self) =>
        Effect.flatMap(CurrentAccount, ({ state }) =>
          Stream.runForEach(state, ({ account }) =>
            self.send({
              _tag: 'Accounts',
              others:
                account._tag === 'SignedIn'
                  ? account.accounts
                      .filter(({ id }) => id !== account.active.id)
                      .map(({ id, email }) => ({ id, email }))
                  : [],
            }),
          ),
        ),
    },
  },
  children: {
    wallets: {
      actor: Wallets,
      while: ({ model }) => model.picked !== null,
      props: ({ model }) => ({ account: model.picked ?? '' }),
    },
    entries: {
      actor: Entries,
      while: ({ model }) => model.picked !== null && model.selected !== null,
      props: ({ model }) => ({
        account: model.picked ?? '',
        wallet: model.selected ?? '',
      }),
    },
  },
  on: {
    // An Account that became the active one, or signed out, is no one to peek at.
    Accounts: ({ others }, { model }) => {
      const kept = others.some(({ id }) => id === model.picked);
      return {
        model: {
          others,
          picked: kept ? model.picked : null,
          selected: kept ? model.selected : null,
        },
      };
    },
    Pick: ({ account }, { model }) => ({
      model: { ...model, picked: account, selected: null },
    }),
    Select: ({ wallet }, { model }) => ({
      model: { ...model, selected: wallet },
    }),
  },
});
