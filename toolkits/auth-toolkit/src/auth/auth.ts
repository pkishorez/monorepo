import { Effect, Effectable } from 'effect';
import {
  HttpApiEndpoint,
  HttpApiGroup,
  type HttpApiMiddleware,
} from 'effect/http-api';
import type { Rpc, RpcGroup } from 'effect/rpc';

import {
  AccountChanged,
  Forbidden,
  httpMiddleware,
  policy as makePolicy,
  rpcMiddleware,
  scope as makeScope,
  Unauthenticated,
  Unavailable,
  User,
  type Invariant,
  type Policy,
} from '../guard/index.js';

type RpcTarget = Rpc.Any | RpcGroup.Any;
type HttpTarget = HttpApiEndpoint.Constraint | HttpApiGroup.Constraint;
type RpcTag = (typeof rpcMiddleware)['middleware'];
type HttpId = Instance<(typeof httpMiddleware)['middleware']>;
type Instance<C> = C extends { new (_: never): infer I } ? I : never;

/** `target` with the Guard attached, whichever Sibling it belongs to. */
export type Guarded<T> =
  T extends RpcGroup.RpcGroup<infer A>
    ? RpcGroup.RpcGroup<Rpc.AddMiddleware<A, RpcTag>>
    : T extends Rpc.Any
      ? Rpc.AddMiddleware<T, RpcTag>
      : T extends HttpApiGroup.Constraint
        ? HttpApiGroup.AddMiddleware<T, HttpId & HttpApiMiddleware.AnyId>
        : T extends HttpApiEndpoint.Constraint
          ? HttpApiEndpoint.AddMiddleware<T, HttpId & HttpApiMiddleware.AnyId>
          : never;

/** Attaches the Guard to an Rpc, an RpcGroup, an HttpApiEndpoint or an
 * HttpApiGroup. */
export type Guard = <T extends RpcTarget | HttpTarget>(target: T) => Guarded<T>;

/** A Guard carrying an Authorization Policy, which is also the same check
 * as an Effect for use inside a handler. An interface, not an intersection,
 * so `pipe` still infers the target. */
export interface PolicyGuard extends Effect.Effect<void, Forbidden, User> {
  <T extends RpcTarget | HttpTarget>(target: T): Guarded<T>;
}

const isHttp = (target: RpcTarget | HttpTarget): target is HttpTarget =>
  HttpApiEndpoint.isHttpApiEndpoint(target) ||
  HttpApiGroup.isHttpApiGroup(target);

const guard =
  (policy?: Policy): Guard =>
  (target) =>
    (isHttp(target)
      ? httpMiddleware.with(policy)(target)
      : rpcMiddleware.with(policy)(target)) as never;

// A Guard that is also an Effect, the way a Context.Service is a class
// that is also an Effect: the function's prototype is an Effect's.
const policyGuard = (policy: Policy): PolicyGuard =>
  Object.setPrototypeOf(
    guard(policy),
    Effectable.Prototype<Effect.Effect<void, Forbidden, User>>({
      label: 'Auth.policy',
      evaluate: () => Effect.flatMap(User, policy),
    }),
  );

/**
 * The Guard, the contract both sides import, the same for Effect RPC and
 * Effect HttpApi; the nearest declaration wins.
 *
 * - `Auth.required`: the call runs only for a known caller.
 * - `Auth.scope(...names)`: only for an Access Token carrying every Scope.
 * - `Auth.policy(invariant, reason)`: only when `invariant` holds.
 *
 * `Auth.scope` and `Auth.policy` are also Effects: `yield* Auth.scope('x')`
 * checks inside a handler. `Auth.User` is who called. The server half is
 * `auth()` from `server/rpc` or `server/http`; the client half comes with
 * the `client/browser` and `client/device` Layers.
 */
export const Auth = {
  required: guard(),
  scope: (...names: [string, ...string[]]): PolicyGuard =>
    policyGuard(makeScope(...names)),
  policy: (invariant: Invariant, reason: string): PolicyGuard =>
    policyGuard(makePolicy(invariant, reason)),
  User,
  Unauthenticated,
  Forbidden,
  Unavailable,
  AccountChanged,
};

export type {
  Invariant,
  Principal,
  SignInPrincipal,
  TokenPrincipal,
} from '../guard/index.js';
