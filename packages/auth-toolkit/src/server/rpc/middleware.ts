import { Effect, Option, Ref } from 'effect';
import { Cookies } from 'effect/unstable/http';

import { Authz } from './authz.js';
import { cannotation } from './cannotation.js';
import type { CurrentAuthResolution } from '../current-auth/index.js';
import { RequestAuthState } from './cookies.js';

export type Verification = Effect.Effect<
  CurrentAuthResolution | null,
  InstanceType<typeof Authz.VerificationUnavailable>
>;

type AuthzImpl = Extract<Parameters<typeof cannotation.layer>[0], Function>;

const requestFromHeaders = (headers: Readonly<Record<string, string>>) =>
  new Request('http://rpc.local', { headers: Object.entries(headers) });

const cookieChanges = (
  cookieHeader: string | undefined,
  setCookieHeaders: ReadonlyArray<string>,
) => {
  const previous = Cookies.parseHeader(cookieHeader ?? '');
  const returned = Object.values(
    Cookies.fromSetCookie(setCookieHeaders).cookies,
  );
  let added = 0;
  let refreshed = 0;
  let reissued = 0;
  let removed = 0;

  for (const cookie of returned) {
    if (cookie.value === '') {
      removed += 1;
    } else if (!Object.hasOwn(previous, cookie.name)) {
      added += 1;
    } else if (previous[cookie.name] === cookie.value) {
      reissued += 1;
    } else {
      refreshed += 1;
    }
  }

  return { added, refreshed, reissued, removed };
};

const makeAuthzImpl = Effect.map(
  Authz.Resolver,
  (resolver): AuthzImpl =>
    ({ headers, rpc, value: policy }) => {
      const verification: Verification = Effect.gen(function* () {
        const resolved = yield* resolver.resolve(requestFromHeaders(headers));

        if (resolved === null) {
          yield* Effect.logDebug('No valid session');
          yield* Effect.annotateCurrentSpan(
            'auth.verification.outcome',
            'missing',
          );
        } else {
          yield* Effect.logDebug('Session verified');
          yield* Effect.annotateCurrentSpan(
            'auth.verification.outcome',
            'verified',
          );
          yield* Effect.annotateCurrentSpan(
            'auth.refreshed_cookie.count',
            resolved.refreshedCookies.length,
          );
          if (resolved.refreshedCookies.length > 0) {
            const changes = cookieChanges(
              headers.cookie,
              resolved.refreshedCookies,
            );
            yield* Effect.logInfo('Session cookies updated').pipe(
              Effect.annotateLogs(changes),
            );
            yield* Effect.annotateCurrentSpan({
              'auth.cookie.added': changes.added,
              'auth.cookie.refreshed': changes.refreshed,
              'auth.cookie.reissued': changes.reissued,
              'auth.cookie.removed': changes.removed,
            });
          }
        }

        return resolved;
      }).pipe(
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
            'rpc.method': rpc._tag,
            'auth.policy.present': Option.isSome(policy),
          },
        }),
      );

      return Effect.gen(function* () {
        const state = yield* Effect.serviceOption(RequestAuthState);
        const resolved = yield* Option.isSome(state)
          ? state.value.verify(verification)
          : verification;

        if (resolved === null) {
          return yield* new Authz.Unauthenticated({
            reason: 'Authentication required',
          });
        }

        if (Option.isSome(state)) {
          yield* Ref.set(
            state.value.refreshedCookies,
            resolved.refreshedCookies,
          );
        }

        if (Option.isSome(policy)) {
          yield* policy.value(resolved.currentAuth).pipe(
            Effect.tap(() =>
              Effect.annotateCurrentSpan('auth.policy.outcome', 'allowed').pipe(
                Effect.andThen(Effect.logDebug('Authorization policy allowed')),
              ),
            ),
            Effect.tapError(() =>
              Effect.annotateCurrentSpan('auth.policy.outcome', 'denied').pipe(
                Effect.andThen(Effect.logDebug('Authorization policy denied')),
              ),
            ),
            Effect.withSpan('auth.evaluate_policy', {
              attributes: { 'rpc.method': rpc._tag },
            }),
          );
        }

        return resolved.currentAuth;
      });
    },
);

export const authzLayer = cannotation.layer(makeAuthzImpl);
