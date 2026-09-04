import { Effect, Layer } from 'effect';
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
} from 'effect/unstable/httpapi';

import {
  AuthVerificationUnavailable,
  CurrentAuth,
  Forbidden,
  Unauthenticated,
  type AuthPolicy,
} from '../auth-context.js';
import {
  CurrentAuthResolver,
  currentAuthResolverLayer,
  type CurrentAuthResolverLayerOptions,
} from '../current-auth.js';
import { decorateWithAuthz, makeHttpApiAuthMiddleware } from './middleware.js';

export {
  AuthVerificationUnavailable,
  CurrentAuth,
  Forbidden,
  Unauthenticated,
  type AuthPolicy,
  type CurrentAuthValue,
} from '../auth-context.js';
export {
  CurrentAuthResolver,
  currentAuthResolverLayer,
  type CurrentAuthResolution,
  type CurrentAuthResolverLayerOptions,
  type CurrentAuthResolverService,
} from '../current-auth.js';

const AuthFailures = [
  Unauthenticated,
  Forbidden,
  AuthVerificationUnavailable,
] as const;

export class HttpApiAuthMiddleware extends HttpApiMiddleware.Service<
  HttpApiAuthMiddleware,
  { provides: CurrentAuth }
>()('auth-toolkit/server/http-api/HttpApiAuthMiddleware', {
  error: AuthFailures,
}) {}

export type HttpApiAuthLayerOptions = CurrentAuthResolverLayerOptions;

export const httpApiAuthMiddlewareLayer = Layer.effect(
  HttpApiAuthMiddleware,
  Effect.map(CurrentAuthResolver, (resolver) =>
    HttpApiAuthMiddleware.of(makeHttpApiAuthMiddleware(resolver)),
  ),
);

export const httpApiAuthLayer = (options: HttpApiAuthLayerOptions) =>
  httpApiAuthMiddlewareLayer.pipe(
    Layer.provide(currentAuthResolverLayer(options)),
  );

type AuthzTarget = HttpApiEndpoint.Constraint | HttpApiGroup.Constraint;

type WithAuthz<T extends AuthzTarget> = T extends HttpApiGroup.Constraint
  ? HttpApiGroup.AddMiddleware<T, HttpApiAuthMiddleware>
  : T extends HttpApiEndpoint.Constraint
    ? HttpApiEndpoint.AddMiddleware<T, HttpApiAuthMiddleware>
    : never;

interface AuthzDecorator {
  <T extends AuthzTarget>(target: T): WithAuthz<T>;
}

export const withAuthz = (policy?: AuthPolicy): AuthzDecorator =>
  ((target: AuthzTarget) =>
    decorateWithAuthz(target, HttpApiAuthMiddleware, policy)) as AuthzDecorator;
