import { Effect, Layer, Stream } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import { bearer } from '../authz/middleware/index.js';
import {
  AccountLimitReached,
  Accounts,
  type AccountsLayer,
  type AccountsState,
  AuthWorkerRejected,
  AuthWorkerUnavailable,
  type SignInOptions,
} from '../client/accounts/index.js';
import { type CacheStorage, makeCache } from '../client/browser/index.js';
import {
  acting,
  makeAccounts,
  type Peers,
  type Snapshot,
  signing,
  type Source,
} from '../client/engine/index.js';
import type { SignInFake, SignInMessage, SignInModel } from './actor.js';
import { warn } from './mark.js';
import { fakeToken } from './token.js';

/*
 * The browser's Accounts over the running Sign-in fake: the real client
 * (auth-toolkit's engine, its cache, its signing) with the fake as its
 * Auth Worker, as `client/browser`'s `browser` runs over the real one.
 *
 * 1. Reach    every call to the Auth Worker waits while it is slow and
 *             fails AuthWorkerUnavailable while it is out of reach.
 * 2. Source   who is signed in is the fake's Model; a switch or sign-out
 *             asked here is a Message to it. A sign-in is a `SignInAsked`
 *             that waits for its answer in the Model: signed in, it comes
 *             back where the real one would (the page leaves for its
 *             `returnTo`, unless it is there already); nobody leaves it as
 *             it was; a failure fails AuthWorkerRejected, saying why.
 * 3. Tabs     a change the fake counts as from another tab is handed to
 *             the engine as another tab's BroadcastChannel would.
 *
 * Every guarded call carries the Active Account's fake token, which
 * `fakeGuard` reads.
 */

/** Where the fake Auth Worker is, as its errors name it. */
export const FAKE_AUTH_WORKER = 'https://auth.sign-in.fake';

export interface FakeBrowserOptions {
  /** Remembers the Accounts last signed in, as `browser`'s `cache`. */
  readonly cache?: CacheStorage | undefined;
  /** Where a sign-in that names no `returnTo` comes back to; unless
   * given, it stays where it is. */
  readonly returnTo?: string | undefined;
  /** How many Accounts the Auth Worker holds for one browser, 5 unless given. */
  readonly maxAccounts?: number | undefined;
  /** How the page leaves for where a sign-in comes back to,
   * `window.location.assign` unless given. A Fake kept across a reload
   * is saved first: the sign-in just answered is in its Model. */
  readonly leave?: ((to: string) => void | Promise<void>) | undefined;
}

const snapshotOf = (model: SignInModel): Snapshot => ({
  active: model.active,
  accounts: model.accounts.map((user) => ({ ...user, image: null })),
});

/** Where a fake sign-in comes back to, as the real one would: the page it
 * leaves for, unless it is the page it is on. */
const leaving = (returnTo: string | undefined) =>
  returnTo === undefined ||
  typeof window === 'undefined' ||
  new URL(returnTo, window.location.href).href === window.location.href
    ? null
    : returnTo;

/** `Accounts` for the browser, and the signing of every guarded call, over the running Sign-in fake. */
export const browserOver = (
  runtime: Runtime<typeof SignInFake>,
  {
    cache,
    returnTo,
    maxAccounts = 5,
    leave = (to) => window.location.assign(to),
  }: FakeBrowserOptions = {},
): AccountsLayer =>
  Layer.unwrap(
    Effect.gen(function* () {
      yield* warn;
      const root = runtime.root;
      // Each sign-in's own id, for its answer. The Model keeps answers
      // across a reload, and each page counts from one again: the page's
      // own mark keeps its ids from meeting an answer an earlier page had.
      const page = Math.random().toString(36).slice(2, 10);
      let asked = 0;
      const send = (message: SignInMessage) =>
        Effect.sync(() => void root.send(message));

      // 1. Reach
      const reach = Effect.orDie(
        root.until(({ model }) => model.authWorker !== 'Slow'),
      ).pipe(
        Effect.flatMap(({ model }) =>
          model.authWorker === 'OutOfReach'
            ? Effect.fail(
                new AuthWorkerUnavailable({
                  url: FAKE_AUTH_WORKER,
                  kind: 'unreachable',
                }),
              )
            : Effect.void,
        ),
      );

      // 2. Source
      const read = Effect.map(reach, () => snapshotOf(root.model));
      const told = (message: SignInMessage) =>
        reach.pipe(Effect.andThen(send(message)), Effect.andThen(read));

      const signIn = (options: SignInOptions, state: AccountsState) =>
        Effect.suspend(() => {
          const id = `sign-in-${page}-${++asked}`;
          const adding = state._tag === 'SignedIn';
          return Effect.gen(function* () {
            yield* reach;
            if (adding && state.accounts.length >= maxAccounts)
              return yield* new AccountLimitReached({ limit: maxAccounts });
            yield* send({ _tag: 'SignInAsked', id, adding });
            const { model } = yield* Effect.orDie(
              root.until(({ model }) =>
                model.answers.some((each) => each.id === id),
              ),
            );
            const answer = model.answers.find((each) => each.id === id)!.answer;
            if (answer._tag === 'Failed')
              return yield* new AuthWorkerRejected({
                url: FAKE_AUTH_WORKER,
                status: 400,
                reason: answer.reason,
              });
            const now = snapshotOf(model);
            const to =
              answer._tag === 'SignedIn'
                ? leaving(options.returnTo ?? returnTo)
                : null;
            if (to === null) return now;
            yield* Effect.promise(async () => leave(to));
            // The page is leaving, as the real sign-in's does.
            return yield* Effect.never;
          }).pipe(
            Effect.onInterrupt(() => send({ _tag: 'SignInWithdrawn', id })),
          );
        });

      const source: Source = {
        read,
        signIn,
        switchTo: (userId) =>
          root.model.accounts.some(({ id }) => id === userId)
            ? told({ _tag: 'SwitchedHere', userId })
            : Effect.fail(
                new AuthWorkerRejected({
                  url: FAKE_AUTH_WORKER,
                  status: 400,
                  code: 'account_not_signed_in',
                  reason: 'That account is not signed in on this browser.',
                }),
              ),
        signOut: (userId) => told({ _tag: 'SignedOutHere', userId }),
        signOutAll: told({ _tag: 'SignedOutAllHere' }),
      };

      // 3. Tabs
      const connect = (peers: Peers) =>
        Effect.gen(function* () {
          let seen = root.model.elsewhere;
          yield* Effect.forkScoped(
            Stream.runForEach(runtime.changes, () =>
              Effect.suspend(() => {
                const { model } = root;
                if (model.elsewhere === seen) return Effect.void;
                seen = model.elsewhere;
                return peers.apply(snapshotOf(model));
              }),
            ),
          );
          return { announce: () => Effect.void };
        });

      const remembered = cache
        ? yield* makeCache.pipe(Effect.provide(cache))
        : { last: Effect.succeed(null), keep: () => Effect.void };
      const made = yield* makeAccounts({
        source,
        last: yield* remembered.last,
        checkOnStart: true,
        keep: remembered.keep,
        connect,
      });

      const signature = made.accounts.current.pipe(
        Effect.flatMap((state) => acting(state, made.settle)),
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
