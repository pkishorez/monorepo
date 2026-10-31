import { Effect, Layer, SubscriptionRef } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  type Account,
  Accounts,
  AccountsState,
} from '@kestack/auth-toolkit/client';

import {
  AccountSwitcherLive,
  AccountSwitcherView,
  CurrentAccount,
} from './account-switcher.tsx';

/*
 * The Account Switcher in a header, on `Accounts` made up here: signed in
 * with three Accounts, each switch taking a second and each sign-out most
 * of one; signed out; and checking, with and without the Account last seen.
 */

const people: ReadonlyArray<Account> = [
  {
    id: 'ada',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    image: null,
    test: false,
  },
  {
    id: 'grace',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    image: null,
    test: false,
  },
  {
    id: 'mary',
    name: 'Mary Somerville',
    email: 'mary.somerville@example.com',
    image: null,
    test: false,
  },
];

const madeUp = (start: AccountsState) =>
  Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make(start);
      const signedIn = Effect.map(SubscriptionRef.get(ref), (state) =>
        state._tag === 'SignedIn' ? state : null,
      );
      return Accounts.of({
        state: SubscriptionRef.changes(ref),
        current: SubscriptionRef.get(ref),
        check: SubscriptionRef.get(ref),
        signIn: () => Effect.sync(() => console.info('signIn')),
        switchTo: (id) =>
          Effect.gen(function* () {
            const now = yield* signedIn;
            const to = now?.accounts.find((each) => each.id === id);
            if (!now || !to) return;
            yield* SubscriptionRef.set(ref, { ...now, switchingTo: to });
            yield* Effect.sleep('1 second');
            yield* SubscriptionRef.set(
              ref,
              AccountsState.SignedIn({ active: to, accounts: now.accounts }),
            );
          }),
        signOut: () =>
          Effect.gen(function* () {
            const now = yield* signedIn;
            if (!now) return;
            yield* Effect.sleep('800 millis');
            const rest = now.accounts.filter(
              (each) => each.id !== now.active.id,
            );
            yield* SubscriptionRef.set(
              ref,
              rest[0]
                ? AccountsState.SignedIn({ active: rest[0], accounts: rest })
                : AccountsState.SignedOut(),
            );
          }),
        signOutAll: Effect.sleep('800 millis').pipe(
          Effect.andThen(SubscriptionRef.set(ref, AccountsState.SignedOut())),
        ),
      });
    }),
  );

const Header = Actor.build(Actor.define('Header', {}), {
  provides: () => CurrentAccount.layer,
  children: {
    account: {
      actor: AccountSwitcherLive,
      input: () => ({ maxAccounts: 5 }),
    },
  },
});

const HeaderView = View.make(Header, ({ root, children }) => (
  <header
    {...root}
    className="flex h-14 items-center gap-6 border-b border-border px-5 text-sm"
  >
    <span className="font-semibold tracking-tight">Kabuki Start</span>
    <span className="flex-1 text-muted-foreground">Rendering · APIs</span>
    <AccountSwitcherView instance={children.account} />
  </header>
));

const app = (name: string, start: AccountsState) =>
  View.app(HeaderView, { layer: madeUp(start), name, window: 0 });

const SignedIn = app(
  'account-switcher-signed-in',
  AccountsState.SignedIn({ active: people[0]!, accounts: people }),
);
const SignedOut = app('account-switcher-signed-out', AccountsState.SignedOut());
const Checking = app('account-switcher-checking', AccountsState.Checking({}));
const Remembered = app(
  'account-switcher-remembered',
  AccountsState.Checking({ last: people[0]! }),
);

export default {
  'Signed in': <SignedIn />,
  'Signed out': <SignedOut />,
  Checking: <Checking />,
  'Checking, remembered': <Remembered />,
};
