import { Context, Effect, Option, type Types } from 'effect';
import {
  HttpEffect,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import {
  HttpApiEndpoint,
  HttpApiGroup,
  type HttpApiMiddleware,
} from 'effect/unstable/httpapi';

import {
  AuthVerificationUnavailable,
  AuthorizationPolicy,
  CurrentAuth,
  Unauthenticated,
  type AuthPolicy,
} from '../auth-context.js';
import type { CurrentAuthResolverService } from '../current-auth.js';

const requestFromHeaders = (headers: Readonly<Record<string, string>>) =>
  new Request('http://http-api.local', { headers: Object.entries(headers) });

const appendSetCookieHeaders = (
  response: HttpServerResponse.HttpServerResponse,
  setCookieHeaders: ReadonlyArray<string>,
): HttpServerResponse.HttpServerResponse => {
  const headers = new Headers(response.headers);
  for (const header of setCookieHeaders) {
    headers.append('set-cookie', header);
  }

  return Object.assign(
    Object.create(Object.getPrototypeOf(response)),
    response,
    { headers },
  ) as HttpServerResponse.HttpServerResponse;
};

export const makeHttpApiAuthMiddleware =
  (resolver: CurrentAuthResolverService) =>
  (
    handler: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      Types.unhandled,
      CurrentAuth
    >,
    {
      endpoint,
    }: {
      readonly endpoint: HttpApiEndpoint.Top;
    },
  ) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const policy = Context.getOption(
        endpoint.annotations,
        AuthorizationPolicy,
      );
      const resolved = yield* resolver
        .resolve(requestFromHeaders(request.headers))
        .pipe(
          Effect.tapError(() =>
            Effect.logWarning('Session verification unavailable'),
          ),
          Effect.mapError(
            () =>
              new AuthVerificationUnavailable({
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
        return yield* new Unauthenticated({
          reason: 'Authentication required',
        });
      }

      if (resolved.refreshedCookies.length > 0) {
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(
            appendSetCookieHeaders(response, resolved.refreshedCookies),
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

      return yield* Effect.provideService(
        handler,
        CurrentAuth,
        resolved.currentAuth,
      );
    });

type AuthzTarget = HttpApiEndpoint.Constraint | HttpApiGroup.Constraint;

export const decorateWithAuthz = (
  target: AuthzTarget,
  middleware: Context.Key<HttpApiMiddleware.AnyId, unknown>,
  policy?: AuthPolicy,
) => {
  if (HttpApiEndpoint.isHttpApiEndpoint(target)) {
    const endpoint =
      policy === undefined
        ? target
        : target.annotate(AuthorizationPolicy, policy);
    return endpoint.middleware(middleware);
  }

  const group = target as HttpApiGroup.Top;
  const endpoints = Object.values(group.endpoints).map((endpoint) => {
    const alreadyHasPolicy = Option.isSome(
      Context.getOption(endpoint.annotations, AuthorizationPolicy),
    );
    const withPolicy =
      policy === undefined || alreadyHasPolicy
        ? endpoint
        : endpoint.annotate(AuthorizationPolicy, policy);
    return withPolicy.middleware(middleware);
  });

  return HttpApiGroup.make(group.identifier, { topLevel: group.topLevel })
    .add(...(endpoints as [HttpApiEndpoint.Top, ...HttpApiEndpoint.Top[]]))
    .annotateMerge(group.annotations);
};
