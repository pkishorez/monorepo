import { Effect, Layer } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { bearer, bearerToken } from '../guard/index.js';
import { Accounts } from '../client/accounts/index.js';
import {
  acting,
  makeAccounts,
  signing,
  watchTabs,
} from '../client/accounts-layer/index.js';
import { httpGuardLayer, rpcGuardLayer } from '../server/guard-layers/index.js';
import { type FakeChoice, makeChooser } from './chooser.js';
import { fakePrincipal } from './principal.js';
import {
  fakeAccountsTable,
  type FakeStorage,
  makeFakeSource,
} from './source.js';
import { fakeToken } from './token.js';

export { fakeAccountsTable };

/**
 * `Accounts` for the browser environment, with no Auth Worker and no
 * identity provider, and the signing of every guarded call: provide this
 * one Layer to the app in place of `browser()`.
 *
 * Signing in asks `choose` who (`fakeChooser()` gives one a dialog
 * answers), or names them with `signIn({ test: { email } })`; any email
 * will do, and the same email is always the same User. Accounts live in
 * `storage` (a `fakeAccountsTable` Layer; in memory unless given), and every
 * guarded call carries the Active Account's fake token, which `fakeGuard`
 * reads. Other tabs are told of every change.
 */
export const fakeAccounts = ({
  choose,
  storage,
}: {
  /** Asks who signs in; null when nobody was chosen. */
  readonly choose: Effect.Effect<FakeChoice | null>;
  /** Where fake Accounts live; in memory unless given. */
  readonly storage?: FakeStorage | undefined;
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const source = yield* makeFakeSource(choose);
      const made = yield* makeAccounts({
        source,
        last: yield* source.read,
        checkOnStart: false,
        connect: watchTabs('@kestack/auth-toolkit/accounts local'),
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
  ).pipe(Layer.provide(storage ?? Memory.make(fakeAccountsTable).layer));

/** A `choose` for `fakeAccounts` that a dialog answers: `choose` waits until
 * `answer` is called, and `subscribe` and `isAsking` tell the dialog when
 * to show. */
export const fakeChooser = () => makeChooser();

// Who a request is from: the User its fake token names, asking no one.
const resolveFake = (request: Request) => {
  const token = bearerToken(request.headers);
  const principal = token === null ? null : fakePrincipal(token);
  return Effect.succeed(
    principal === null ? null : { principal, refreshedCookies: [] },
  );
};

/**
 * The Guard's server half for the browser environment's backend, in
 * process or anywhere else: reads the fake token `fakeAccounts` signs each
 * call with, and asks no one. Every fake User is admitted, Test Users
 * included, so it must never guard real data: anyone may be anyone.
 *
 * - `fakeGuard.rpc()`: for Effect RPC, given with the group's handlers.
 * - `fakeGuard.http()`: for Effect HttpApi, given with the API's handlers.
 */
export const fakeGuard = {
  rpc: () => rpcGuardLayer(resolveFake, { testUsers: true }),
  http: () => httpGuardLayer(resolveFake, { testUsers: true }),
};
