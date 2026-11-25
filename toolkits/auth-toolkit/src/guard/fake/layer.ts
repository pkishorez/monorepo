import { Effect, Layer, Stream, SubscriptionRef } from 'effect';
import { bearer } from '../authz/middleware/index.js';
import {
  AccountLimitReached,
  Accounts,
  type AccountsLayer,
  type AccountsState,
  AuthWorkerRejected,
} from '../client/accounts/index.js';
import { type CacheStorage, makeCache } from '../client/browser/index.js';
import {
  acting,
  makeAccounts,
  type Snapshot,
  signing,
  type Source,
} from '../client/engine/index.js';
import { warn } from './mark.js';
import type { SignInState } from './sign-in.js';
import { fakeToken } from './token.js';

/*
 * The browser's Accounts over the Sign-in fake's state: the real client
 * (auth-toolkit's engine, its cache, its signing) with the fake as its
 * Auth Worker, as `client/browser`'s `browser` runs over the real one.
 *
 * 1. Ask     a sign-in puts itself in `asking` and waits there, on this
 *            page, until a control answers it (signed in, or nobody) or a
 *            newer sign-in ends it; given up, it takes itself out.
 * 2. Here    a switch or sign-out asked here changes the state at once.
 * 3. Sign    every guarded call carries the Active Account's fake token,
 *            which `fakeGuard` reads.
 */

/** Where the fake Auth Worker is, as its errors name it. */
const FAKE_AUTH_WORKER = 'https://auth.sign-in.fake';

/** How many Accounts the fake Auth Worker holds for one browser. */
const MAX_ACCOUNTS = 5;

const snapshotOf = ({ active, accounts }: SignInState): Snapshot => ({
  active,
  accounts: accounts.map((user) => ({ ...user, image: null })),
});

/** `Accounts` for the browser, and the signing of every guarded call, over the Sign-in fake's state. */
export const accountsOver = (
  state: SubscriptionRef.SubscriptionRef<SignInState>,
  { cache }: { readonly cache?: CacheStorage | undefined },
): AccountsLayer =>
  Layer.unwrap(
    Effect.gen(function* () {
      // The mark every fake carries: a production build that has it fails.
      yield* warn;
      const read = Effect.map(SubscriptionRef.get(state), snapshotOf);
      const changed = (change: (now: SignInState) => SignInState) =>
        Effect.andThen(SubscriptionRef.update(state, change), read);

      // 1. Ask. Each sign-in's turn: only the latest may be answered.
      let latest = 0;
      const answered = (turn: number) =>
        SubscriptionRef.changes(state).pipe(
          Stream.filter(({ asking }) => asking === null || turn !== latest),
          Stream.take(1),
          Stream.runDrain,
        );
      const signIn = (_: unknown, now: AccountsState) =>
        Effect.suspend(() => {
          const adding = now._tag === 'SignedIn';
          if (adding && now.accounts.length >= MAX_ACCOUNTS)
            return Effect.fail(
              new AccountLimitReached({ limit: MAX_ACCOUNTS }),
            );
          const turn = ++latest;
          return SubscriptionRef.update(state, (s) => ({
            ...s,
            asking: { adding },
          })).pipe(
            Effect.andThen(answered(turn)),
            Effect.andThen(read),
            Effect.onInterrupt(() =>
              SubscriptionRef.update(state, (s) =>
                turn === latest ? { ...s, asking: null } : s,
              ),
            ),
          );
        });

      // 2. Here
      const source: Source = {
        read,
        signIn,
        switchTo: (userId) =>
          Effect.flatMap(SubscriptionRef.get(state), ({ accounts }) =>
            accounts.some(({ id }) => id === userId)
              ? changed((s) => ({ ...s, active: userId }))
              : Effect.fail(
                  new AuthWorkerRejected({
                    url: FAKE_AUTH_WORKER,
                    status: 400,
                    code: 'account_not_signed_in',
                    reason: 'That account is not signed in on this browser.',
                  }),
                ),
          ),
        signOut: (userId) =>
          changed((s) => {
            const accounts = s.accounts.filter(({ id }) => id !== userId);
            const stays = accounts.some(({ id }) => id === s.active);
            return {
              ...s,
              accounts,
              active: stays ? s.active : (accounts[0]?.id ?? null),
            };
          }),
        signOutAll: changed((s) => ({ ...s, accounts: [], active: null })),
      };

      const remembered = cache
        ? yield* makeCache.pipe(Effect.provide(cache))
        : { last: Effect.succeed(null), keep: () => Effect.void };
      const made = yield* makeAccounts({
        source,
        last: yield* remembered.last,
        checkOnStart: true,
        keep: remembered.keep,
      });

      // 3. Sign
      const signature = made.accounts.current.pipe(
        Effect.flatMap((now) => acting(now, made.settle)),
        Effect.map((user) => bearer(fakeToken.make(user))),
      );
      return Layer.mergeAll(
        Layer.succeed(Accounts, made.accounts),
        signing({
          signature,
          refused: 'Unauthenticated',
          recheck: made.accounts.check,
        }),
      );
    }),
  );
