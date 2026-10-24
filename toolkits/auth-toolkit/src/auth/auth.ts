import type { Effect } from 'effect';
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
  withEffect,
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

/** Guards an Rpc, RpcGroup, HttpApiEndpoint or HttpApiGroup: it runs only
 * for a known caller. The nearest declaration wins. */
const required: Guard = /*#__PURE__*/ guard();

/** Guards it for an Access Token carrying every named Scope; `yield*` it
 * to check inside a handler. */
const scope = (...names: [string, ...string[]]): PolicyGuard => {
  const policy = makeScope(...names);
  return withEffect(guard(policy), policy) as PolicyGuard;
};

/** Guards it with `invariant`, failing Forbidden with `reason`; `yield*` it
 * to check inside a handler. */
const policy = (invariant: Invariant, reason: string): PolicyGuard => {
  const made = makePolicy(invariant, reason);
  return withEffect(guard(made), made) as PolicyGuard;
};

/**
 * The Guard, the contract both sides import, the same for Effect RPC and
 * Effect HttpApi: `Authz.required`, `Authz.scope` and `Authz.policy` guard
 * a call, `Authz.User` is who called, and the errors are what a guarded
 * call fails with. The server half is `auth.rpc()` or `auth.http()`
 * from `server`; the client half comes with the `client/browser` and
 * `client/device` Layers.
 */
export const Authz = {
  required,
  scope,
  policy,
  User,
  Unauthenticated,
  Forbidden,
  Unavailable,
  AccountChanged,
};

/** The types of `Authz`'s classes, so `Authz.Unauthenticated` names the error too. */
type UserService = User;
type UnauthenticatedError = Unauthenticated;
type ForbiddenError = Forbidden;
type UnavailableError = Unavailable;
type AccountChangedError = AccountChanged;

export declare namespace Authz {
  /** The Service a guarded handler reads the caller from. */
  export type User = UserService;
  /** A guarded call nobody signed: 401. */
  export type Unauthenticated = UnauthenticatedError;
  /** A call its Policy refused: 403. */
  export type Forbidden = ForbiddenError;
  /** The Auth Worker could not be asked: 503. */
  export type Unavailable = UnavailableError;
  /** A Browser call whose `expect-user` is not the cookie's Active Account: 409. */
  export type AccountChanged = AccountChangedError;
}

export type { Principal } from '../guard/index.js';
