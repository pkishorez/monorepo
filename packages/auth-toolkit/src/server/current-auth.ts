import type { Session, User } from 'better-auth';
import { Context, Effect, Layer } from 'effect';

import { verifyRequest } from './server.js';

export interface CurrentAuthValue {
  readonly session: Session;
  readonly user: User;
}

export interface CurrentAuthResolution {
  readonly currentAuth: CurrentAuthValue;
  readonly refreshedCookies: ReadonlyArray<string>;
}

export interface CurrentAuthResolverService {
  readonly resolve: (
    request: Request,
  ) => Effect.Effect<CurrentAuthResolution | null, unknown>;
}

export class CurrentAuthResolver extends Context.Service<
  CurrentAuthResolver,
  CurrentAuthResolverService
>()('auth-toolkit/server/CurrentAuthResolver') {}

export interface CurrentAuthResolverLayerOptions {
  /** The deployed URL of the Auth Worker used for session verification. */
  readonly authWorkerUrl: string;
}

// Resolves Current Auth through the Auth Worker's server-side verifier.
export const currentAuthResolverLayer = ({
  authWorkerUrl,
}: CurrentAuthResolverLayerOptions) =>
  Layer.succeed(
    CurrentAuthResolver,
    CurrentAuthResolver.of({
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
