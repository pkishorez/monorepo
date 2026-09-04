import { Effect, Layer } from 'effect';

import { auth } from '../current-auth/index.js';
import { verifyRequest } from '../verification/index.js';

export const resolverLive = ({ authWorkerUrl }: { authWorkerUrl: string }) =>
  Layer.succeed(
    auth.Resolver,
    auth.Resolver.of({
      resolve: (request) =>
        Effect.tryPromise(() => verifyRequest({ authWorkerUrl, request })).pipe(
          Effect.map((verified) =>
            verified === null
              ? null
              : {
                  currentAuth: {
                    session: verified.session,
                    user: verified.user,
                  },
                  refreshedCookies: verified.refreshedCookies,
                },
          ),
        ),
    }),
  );
