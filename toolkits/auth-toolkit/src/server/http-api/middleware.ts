import { Effect, Option } from 'effect';
import { HttpEffect } from 'effect/unstable/http';

import { appendRefreshedCookies } from '../refreshed-cookies/index.js';
import { Authz } from './authz.js';
import { cannotation } from './cannotation.js';

type AuthzImpl = Extract<Parameters<typeof cannotation.layer>[0], Function>;

const requestFromHeaders = (headers: Readonly<Record<string, string>>) =>
  new Request('http://http-api.local', { headers: Object.entries(headers) });

export const makeAuthzImpl = Effect.map(
  Authz.Resolver,
  (resolver): AuthzImpl =>
    ({ endpoint, request, value: policy }) =>
      Effect.gen(function* () {
        const resolved = yield* resolver
          .resolve(requestFromHeaders(request.headers))
          .pipe(
            Effect.tapError(() =>
              Effect.logWarning('Session verification unavailable'),
            ),
            Effect.mapError(
              () =>
                new Authz.VerificationUnavailable({
                  reason: 'Session verification unavailable',
                }),
            ),
            Effect.withSpan('auth.verify_session', {
              attributes: {
                'http.endpoint': endpoint.identifier,
                'auth.policy.present': Option.isSome(policy),
              },
            }),
          );

        if (resolved === null) {
          return yield* new Authz.Unauthenticated({
            reason: 'Authentication required',
          });
        }

        if (resolved.refreshedCookies.length > 0) {
          yield* HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(
              appendRefreshedCookies(response, resolved.refreshedCookies),
            ),
          );
        }

        if (Option.isSome(policy)) {
          yield* policy.value(resolved.currentAuth).pipe(
            Effect.withSpan('auth.evaluate_policy', {
              attributes: { 'http.endpoint': endpoint.identifier },
            }),
          );
        }

        return resolved.currentAuth;
      }),
);
