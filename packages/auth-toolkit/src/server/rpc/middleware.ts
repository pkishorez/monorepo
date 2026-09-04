import { Context, Effect, Layer, Option, Ref, Schema } from 'effect';
import { Cookies } from 'effect/unstable/http';
import { Rpc, RpcGroup, RpcMiddleware } from 'effect/unstable/rpc';

import {
  CurrentAuthResolver,
  currentAuthResolverLayer,
  type CurrentAuthResolution,
  type CurrentAuthResolverLayerOptions,
} from '../current-auth.js';
import {
  AuthorizationPolicy,
  CurrentAuth,
  Forbidden,
  Unauthenticated,
  type AuthPolicy,
} from './context.js';
import { RequestAuthState } from './cookies.js';

export type Verification = Effect.Effect<
  CurrentAuthResolution | null,
  Unauthenticated
>;

const AuthFailure = Schema.Union([Unauthenticated, Forbidden]);

export class RpcAuthMiddleware extends RpcMiddleware.Service<
  RpcAuthMiddleware,
  { provides: CurrentAuth }
>()('auth-toolkit/server/rpc/RpcAuthMiddleware', {
  error: AuthFailure,
}) {}

export type RpcAuthLayerOptions = CurrentAuthResolverLayerOptions;

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

// Builds the RPC middleware from the currently provided Current Auth Resolver.
export const rpcAuthMiddlewareLayer = Layer.effect(
  RpcAuthMiddleware,
  Effect.map(CurrentAuthResolver, (resolver) =>
    RpcAuthMiddleware.of((handler, { headers, rpc }) => {
      const policy = Context.getOption(rpc.annotations, AuthorizationPolicy);
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
        Effect.tapError(() => Effect.logWarning('Session verification failed')),
        Effect.mapError(
          () =>
            new Unauthenticated({
              reason: 'Session verification failed',
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
          return yield* new Unauthenticated({
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

        return yield* Effect.provideService(
          handler,
          CurrentAuth,
          resolved.currentAuth,
        );
      });
    }),
  ),
);

// Provides the RPC middleware backed by the Auth Worker's verifier.
export const rpcAuthLayer = (options: RpcAuthLayerOptions) =>
  rpcAuthMiddlewareLayer.pipe(Layer.provide(currentAuthResolverLayer(options)));

type AuthzTarget = Rpc.Any | RpcGroup.Any;

type WithAuthz<T extends AuthzTarget> =
  T extends RpcGroup.RpcGroup<infer A>
    ? RpcGroup.RpcGroup<Rpc.AddMiddleware<A, typeof RpcAuthMiddleware>>
    : T extends Rpc.Any
      ? Rpc.AddMiddleware<T, typeof RpcAuthMiddleware>
      : never;

interface AuthzDecorator {
  <T extends AuthzTarget>(target: T): WithAuthz<T>;
}

// Declares authentication, and optionally authorization, on an RPC or group.
// A policy on a more specific RPC takes precedence over an inherited group
// policy. Calling this without a policy never removes an inherited policy.
export const withAuthz = (policy?: AuthPolicy): AuthzDecorator =>
  ((target: Rpc.Any | RpcGroup.Any) => {
    if (Rpc.isRpc(target)) {
      if (policy === undefined) {
        return target.middleware(RpcAuthMiddleware);
      }

      return target
        .annotate(AuthorizationPolicy, policy)
        .middleware(RpcAuthMiddleware);
    }

    const group = target as RpcGroup.RpcGroup<Rpc.Any>;

    if (policy === undefined) {
      return group.middleware(RpcAuthMiddleware);
    }

    const rpcsWithPolicy = Array.from(group.requests.values(), (rpc) => {
      const alreadyHasPolicy = Option.isSome(
        Context.getOption(rpc.annotations, AuthorizationPolicy),
      );

      if (alreadyHasPolicy) {
        return rpc;
      }

      return (rpc as Rpc.Rpc<string>).annotate(AuthorizationPolicy, policy);
    });

    return RpcGroup.make(...rpcsWithPolicy)
      .annotateMerge(group.annotations)
      .middleware(RpcAuthMiddleware);
  }) as unknown as AuthzDecorator;
