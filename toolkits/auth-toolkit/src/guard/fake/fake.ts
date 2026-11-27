import { Effect, Layer, Stream, SubscriptionRef } from 'effect';
import {
  bearer,
  bearerToken,
  type HttpGuard,
  type Principal,
  type RpcGuard,
  type Signing,
  Unauthenticated,
} from '../authz/middleware/index.js';
import type { AccountsLayer } from '../client/accounts/index.js';
import { signing } from '../client/engine/index.js';
import { httpGuardLayer, rpcGuardLayer } from '../server/guard-layer/index.js';
import { accountsOver } from './layer.js';
import { warn } from './mark.js';
import { fakePrincipal } from './principal.js';
import { cancel, signIn, signInAs, type SignInState } from './sign-in.js';
import { fakeToken } from './token.js';

/** Who to sign in as: an email at `kestack.test`, and optionally a name. */
export interface FakeChoice {
  readonly email: string;
  readonly name?: string;
}

/**
 * `Accounts` and the signing of every guarded call, over a Sign-in fake of
 * its own whose every sign-in `choose` answers (null for nobody): for
 * tests, and anywhere no person answers its controls. Only an email at
 * `kestack.test` signs in; any other is refused, and the sign-in ends with
 * nobody.
 */
export const fakeAccounts = ({
  choose,
}: {
  /** Answers who signs in; null when nobody does. */
  readonly choose: Effect.Effect<FakeChoice | null>;
}): AccountsLayer =>
  Layer.unwrap(
    Effect.gen(function* () {
      const state = yield* SubscriptionRef.make(signIn().initial);
      // The sign-in last answered, so each is answered once.
      let answered: SignInState['asking'] = null;
      const answer = (choice: FakeChoice | null) =>
        choice === null
          ? cancel(state)
          : signInAs(state, {
              email: choice.email,
              name: choice.name ?? '',
            }).pipe(Effect.catch(() => cancel(state)));
      yield* Effect.forkScoped(
        Stream.runForEach(SubscriptionRef.changes(state), () =>
          Effect.gen(function* () {
            const { asking } = yield* SubscriptionRef.get(state);
            if (asking === null || asking === answered) return;
            answered = asking;
            yield* Effect.ignore(Effect.flatMap(choose, answer));
          }),
        ),
      );
      return accountsOver(state, {});
    }),
  );

// Who a request is from: the User its fake token names, asking no one.
const resolveFake = (request: Request) => {
  const token = bearerToken(request.headers);
  const principal = token === null ? null : fakePrincipal(token);
  return Effect.succeed(
    principal === null ? null : { principal, refreshedCookies: [] },
  );
};

/** Who every call is from: the fake token's User, or `as` when given. */
interface FakeGuardOptions {
  /** Puts this Principal (null for nobody) behind every call, whatever it
   * carries: for handlers' tests. */
  readonly as?: Principal | null | undefined;
}

const resolverOf = ({ as }: FakeGuardOptions) =>
  as === undefined
    ? resolveFake
    : () =>
        Effect.succeed(
          as === null ? null : { principal: as, refreshedCookies: [] },
        );

/**
 * The Guard's server half with nobody behind it: it asks no one. Every fake
 * User is admitted, and only a fake User: a token is believed only for an
 * email at `kestack.test`, whose User is made from the email again. Still,
 * anyone may be any fake User, so it must never guard real data.
 *
 * - `fakeGuard.rpc()`: for Effect RPC, given with the group's handlers. It
 *   reads the fake token the Sign-in fake's Accounts sign each call with.
 * - `fakeGuard.http()`: the same for Effect HttpApi.
 * - `fakeGuard.rpc({ as })` and `fakeGuard.http({ as })`: `as` behind every
 *   call (null for nobody), for handlers' tests.
 */
export const fakeGuard = {
  rpc: (options: FakeGuardOptions = {}): RpcGuard =>
    Layer.merge(rpcGuardLayer(resolverOf(options)), Layer.effectDiscard(warn)),
  http: (options: FakeGuardOptions = {}): HttpGuard =>
    Layer.merge(httpGuardLayer(resolverOf(options)), Layer.effectDiscard(warn)),
};

/**
 * The Guard's client half for a device signed in on a Sign-in of its own
 * (`fakeSignIn`), as `ke-connect` holds one: every call signed with its
 * User's fake token; for nobody, never sent, failing Unauthenticated, as a
 * device signed out. A client built with it calls as that device whatever
 * other `Signing` is around, such as a browser tab's Accounts in the same
 * page.
 */
export const fakeSigning = (signIn: Principal | null): Layer.Layer<Signing> =>
  signing({
    signature:
      signIn === null
        ? Effect.fail(new Unauthenticated({ reason: 'Not signed in' }))
        : Effect.succeed(bearer(fakeToken.make(signIn.user))),
    refused: 'Unauthenticated',
    recheck: Effect.void,
  });
