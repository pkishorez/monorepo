import { Effect } from 'effect';
import { Headers, HttpClientRequest } from 'effect/http';

import type { Unauthenticated } from './errors.js';
import { EXPECT_USER } from './headers.js';
import { httpMiddleware, rpcMiddleware } from './guard.js';

/** The headers one guarded call is signed with, read at that call. Failing
 * Unauthenticated fails the call without sending it. */
export type Signature<R> = Effect.Effect<
  Readonly<Record<string, string>>,
  Unauthenticated,
  R
>;

/** The headers a Device signs a call with: its Account's Sign-in token, or a
 * Local Token. */
export const bearer = (token: string): Readonly<Record<string, string>> => ({
  authorization: `Bearer ${token}`,
});

/** The headers a Browser signs a call with: the User it expects the cookie's
 * Active Account to be. The cookie itself goes by `credentials: 'include'`. */
export const expectUser = (
  userId: string,
): Readonly<Record<string, string>> => ({ [EXPECT_USER]: userId });

/** The Guard's client half for Effect RPC: puts `signature`'s headers on
 * every guarded call, over any Transport. */
export const signRpc = <R = never>(signature: Signature<R>) =>
  rpcMiddleware.client<R>(({ request, next }) =>
    Effect.flatMap(signature, (headers) =>
      next({ ...request, headers: Headers.setAll(request.headers, headers) }),
    ),
  );

/** The Guard's client half for Effect HttpApi. An HttpApi client
 * middleware cannot fail typed, so a call `signature` refuses goes unsigned
 * and the server answers it Unauthenticated. */
export const signHttp = <R = never>(signature: Signature<R>) =>
  httpMiddleware.client<R>(({ request, next }) =>
    Effect.flatMap(
      Effect.orElseSucceed(signature, () => ({})),
      (headers) => next(HttpClientRequest.setHeaders(request, headers)),
    ),
  );
