import { Effect } from 'effect';
import { Headers } from 'effect/http';

import { auth } from '../../current-auth/index.js';
import { cannotation } from '../cannotation/index.js';

/** Signs every guarded call an RPC client makes as one Session, over any
 * Protocol: `Authorization: Bearer` with the token `token` gives at each
 * call. Read as a function, a null token fails the call Unauthenticated
 * without sending it; as an Effect, the call waits for it. */
const bearer = (token: (() => string | null) | Effect.Effect<string>) =>
  cannotation.clientLayer(({ request, next }) =>
    Effect.flatMap(
      Effect.isEffect(token) ? token : Effect.sync(token),
      (current) =>
        current === null
          ? Effect.fail(
              new auth.Unauthenticated({
                reason: 'No token for this Session yet',
              }),
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

export const Authz: typeof auth & {
  readonly guard: (typeof cannotation)['with'];
  readonly bearer: typeof bearer;
} = { ...auth, guard: cannotation.with, bearer };
