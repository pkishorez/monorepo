import { Effect } from 'effect';
import { Headers } from 'effect/http';

import { auth } from '../../current-auth/index.js';
import { cannotation } from '../cannotation/index.js';

/** Signs every guarded call an RPC client makes as one Session, over any
 * Protocol: `Authorization: Bearer` with the token `token` reads at each
 * call. While it is null, calls fail Unauthenticated without being sent. */
const bearer = (token: () => string | null) =>
  cannotation.clientLayer(({ request, next }) =>
    Effect.suspend(() => {
      const current = token();
      return current === null
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
          });
    }),
  );

export const Authz: typeof auth & {
  readonly guard: (typeof cannotation)['with'];
  readonly bearer: typeof bearer;
} = { ...auth, guard: cannotation.with, bearer };
