import { Effect } from 'effect';
import { Headers } from 'effect/http';
import {
  Current,
  Forbidden,
  policy,
  Resolver,
  scope,
  Unauthenticated,
  Unavailable,
} from './current.js';
import { httpMiddleware, rpcMiddleware } from './middleware.js';

/** What both flavours of the guard share. */
const shared = {
  Current,
  Resolver,
  Unauthenticated,
  Forbidden,
  Unavailable,
  policy,
  scope,
};

/** Signs every guarded call an RPC client makes as one Account, over any
 * Transport: `Authorization: Bearer` with the token `token` gives at each
 * call. Read as a function, a null token fails the call Unauthenticated
 * without sending it; as an Effect, the call waits for it. */
const bearer = (token: (() => string | null) | Effect.Effect<string>) =>
  rpcMiddleware.client(({ request, next }) =>
    Effect.flatMap(
      Effect.isEffect(token) ? token : Effect.sync(token),
      (current) =>
        current === null
          ? Effect.fail(
              new Unauthenticated({ reason: 'No token for this Account yet' }),
            )
          : next({
              ...request,
              headers: Headers.set(
                request.headers,
                'authorization',
                `Bearer ${current}`,
              ),
            }),
    ),
  );

/**
 * The guard for Effect RPC, the contract both sides import: `guard(policy?)`
 * attaches it to an Rpc or an RpcGroup (the nearest value wins), `Current`
 * is who called, `bearer` signs a client's calls. The server half is
 * `authz.layer` from `@kstackz/auth-toolkit/server`.
 */
export const Authz: typeof shared & {
  readonly guard: (typeof rpcMiddleware)['with'];
  readonly bearer: typeof bearer;
} = { ...shared, guard: rpcMiddleware.with, bearer };

/** The same guard for Effect HttpApi; its server half is `authz.http`. */
export const AuthzHttp: typeof shared & {
  readonly guard: (typeof httpMiddleware)['with'];
} = { ...shared, guard: httpMiddleware.with };
