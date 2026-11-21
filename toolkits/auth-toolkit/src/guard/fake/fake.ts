import { Effect, Layer, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import {
  bearerToken,
  type HttpGuard,
  type Principal,
  type RpcGuard,
} from '../authz/middleware/index.js';
import type { AccountsLayer } from '../client/accounts/index.js';
import { httpGuardLayer, rpcGuardLayer } from '../server/guard-layer/index.js';
import { SignInFake } from './actor.js';
import { fakePrincipal } from './principal.js';
import { browserOver } from './serve.js';
import { warn } from './mark.js';

/** Who to sign in as: an email at `kestack.test`, and optionally a name. */
export interface FakeChoice {
  readonly email: string;
  readonly name?: string;
}

/**
 * `Accounts` and the signing of every guarded call, over a Sign-in fake of
 * its own whose every sign-in `choose` answers (null for nobody): for
 * tests, and anywhere no person answers in the bubble. Only an email at
 * `kestack.test` signs in; any other fails the sign-in. A sign-in comes
 * back to `returnTo` as `browserOver`'s does.
 */
export const fakeAccounts = ({
  choose,
  returnTo,
}: {
  /** Answers who signs in; null when nobody does. */
  readonly choose: Effect.Effect<FakeChoice | null>;
  /** Where a sign-in that names no `returnTo` comes back to; unless
   * given, it stays where it is. */
  readonly returnTo?: string | undefined;
}): AccountsLayer =>
  Layer.unwrap(
    Effect.gen(function* () {
      yield* warn;
      const runtime = yield* Runtime.scoped(SignInFake);
      const answered = new Set<string>();
      yield* Effect.forkScoped(
        Stream.runForEach(runtime.changes, () =>
          Effect.suspend(() => {
            const { asking } = runtime.root.model;
            if (asking === null || answered.has(asking.id)) return Effect.void;
            answered.add(asking.id);
            return Effect.map(choose, (choice) => {
              runtime.root.send(
                choice === null
                  ? { _tag: 'CancelSignIn' }
                  : {
                      _tag: 'SignInAs',
                      email: choice.email,
                      name: choice.name ?? '',
                    },
              );
            });
          }),
        ),
      );
      return browserOver(runtime, { returnTo });
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
