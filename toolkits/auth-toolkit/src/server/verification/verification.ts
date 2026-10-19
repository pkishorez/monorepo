import { Effect, Option } from 'effect';

import {
  AccountChanged,
  bearerToken,
  EXPECT_USER,
  type Forbidden,
  Unauthenticated,
  Unavailable,
  type Policy,
  type Principal,
} from '../../guard/index.js';
import { verifyAccessToken } from './access-token.js';
import { localPrincipal } from './local.js';
import { isLocal, type AuthOptions } from './options.js';
import { cookieChanges } from './refreshed-cookies.js';
import { verifySignIn } from './session.js';

/** Who a request is from, and the Sign-in cookies refreshed while finding
 * out. */
export interface Resolution {
  readonly principal: Principal;
  readonly refreshedCookies: ReadonlyArray<string>;
}

/** The Resolver: finds out who a request is from; null for nobody, a
 * failure when it could not be found out. */
export type Resolve = (
  request: Request,
) => Effect.Effect<Resolution | null, unknown>;

// `options` were checked by `isLocal` first.
const resolveWith = async (
  options: AuthOptions,
  request: Request,
): Promise<Resolution | null> => {
  const token = bearerToken(request.headers);
  if (options.local === true) {
    const principal = token === null ? null : localPrincipal(token);
    return principal === null ? null : { principal, refreshedCookies: [] };
  }

  if (token !== null && options.oauth !== undefined) {
    const identity = await verifyAccessToken(
      options.url,
      options.oauth.resource,
      token,
    );
    if (identity !== null) {
      return {
        principal: { kind: 'token', ...identity },
        refreshedCookies: [],
      };
    }
  }

  // A bearer that is no Access Token is a Device token; a bearer is never
  // followed by the cookie.
  const verified = await verifySignIn(options.url, request);
  return verified === null
    ? null
    : {
        principal: {
          kind: 'session',
          session: verified.session,
          user: verified.user,
        },
        refreshedCookies: verified.refreshedCookies,
      };
};

/** The Resolver `options` describe; throws for options naming no one
 * mode. */
export const resolver = (options: AuthOptions): Resolve => {
  isLocal(options);
  return (request) => Effect.tryPromise(() => resolveWith(options, request));
};

/** A Resolver that finds `principal` behind every request, for tests. */
export const fixedResolver =
  (principal: Principal | null): Resolve =>
  () =>
    Effect.succeed(
      principal === null ? null : { principal, refreshedCookies: [] },
    );

/**
 * Who `request` is from, for code outside Effect's servers: a raw WebSocket
 * upgrade, a plain fetch handler. Resolves null for nobody; rejects when the
 * Auth Worker could not be asked.
 */
export const verify = async (
  request: Request,
  options: AuthOptions,
): Promise<Principal | null> => {
  isLocal(options);
  return (await resolveWith(options, request))?.principal ?? null;
};

/**
 * `verify`, with the Sign-in cookies the Auth Worker refreshed while
 * verifying, which the response to `request` should carry, as a page drawn
 * on the server or a socket's upgrade.
 */
export const verifyRefreshing = (
  request: Request,
  options: AuthOptions,
): Promise<Resolution | null> => {
  isLocal(options);
  return resolveWith(options, request);
};

/** A request carrying only `headers`, as the Resolver reads it. */
export const requestOf = (headers: Readonly<Record<string, string>>) =>
  new Request('http://auth.local', { headers: Object.entries(headers) });

type Attributes = Readonly<Record<string, unknown>>;

/** Runs the Resolver for one call, logging what it found and failing
 * Unavailable when the Auth Worker could not be asked. */
export const identify = (
  resolve: Resolve,
  request: Request,
  attributes: Attributes,
): Effect.Effect<Resolution | null, Unavailable> =>
  Effect.gen(function* () {
    const resolved = yield* resolve(request);

    if (resolved === null) {
      yield* Effect.logDebug('No valid session');
      yield* Effect.annotateCurrentSpan('auth.verification.outcome', 'missing');
      return resolved;
    }

    yield* Effect.logDebug('Session verified');
    yield* Effect.annotateCurrentSpan('auth.verification.outcome', 'verified');
    yield* Effect.annotateCurrentSpan(
      'auth.refreshed_cookie.count',
      resolved.refreshedCookies.length,
    );
    if (resolved.refreshedCookies.length > 0) {
      const changes = cookieChanges(
        request.headers.get('cookie') ?? undefined,
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
    return resolved;
  }).pipe(
    Effect.tapError(() =>
      Effect.logWarning('Session verification unavailable'),
    ),
    Effect.mapError(
      () => new Unavailable({ reason: 'Session verification unavailable' }),
    ),
    Effect.withSpan('auth.verify_session', { attributes }),
  );

/**
 * Applies the Guard to one call's caller: Unauthenticated for nobody,
 * AccountChanged when a cookie caller's User is not the one its
 * `expect-user` names (a bearer caller's is ignored), then the policy.
 */
export const admit = (
  resolved: Resolution | null,
  request: Request,
  policy: Option.Option<Policy>,
  attributes: Attributes,
): Effect.Effect<Principal, Unauthenticated | AccountChanged | Forbidden> =>
  Effect.gen(function* () {
    if (resolved === null) {
      return yield* new Unauthenticated({
        reason: 'Authentication required',
      });
    }
    const { principal } = resolved;

    const expected = request.headers.get(EXPECT_USER);
    if (
      expected !== null &&
      bearerToken(request.headers) === null &&
      expected !== principal.user.id
    ) {
      yield* Effect.logInfo('Active Account changed');
      return yield* new AccountChanged({
        reason: 'The Active Account is not the expected User',
      });
    }

    if (Option.isSome(policy)) {
      yield* policy.value(principal).pipe(
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
        Effect.withSpan('auth.evaluate_policy', { attributes }),
      );
    }

    return principal;
  });
