import * as Cloudflare from 'alchemy/Cloudflare';
import { Data, Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

export const RpcWorker = Cloudflare.RpcWorker;

interface RateLimitGuard {
  readonly name: string;
  readonly namespaceId: number;
  readonly limit: number;
  readonly period: 10 | 60;
}

export class RateLimitExceeded extends Data.TaggedError('RateLimitExceeded')<{
  readonly key: string;
}> {}

export const RateLimit = (guard: RateLimitGuard) =>
  Cloudflare.RateLimit(guard.name, {
    namespaceId: guard.namespaceId,
    simple: { limit: guard.limit, period: guard.period },
  });

export const checkRateLimit = (
  throttle: Cloudflare.RateLimitClient,
  key: string,
) =>
  throttle.limit({ key }).pipe(
    Effect.map((outcome) => outcome.success),
    Effect.catchTag('RateLimitError', () => Effect.succeed(true)),
    Effect.flatMap((allowed) =>
      allowed ? Effect.void : Effect.fail(new RateLimitExceeded({ key })),
    ),
  );

export const tooManyRequests = (message: string, period: 10 | 60) =>
  HttpServerResponse.text(message, {
    status: 429,
    headers: { 'retry-after': String(period) },
  });

const byConnectingIp = (request: HttpServerRequest.HttpServerRequest): string =>
  request.headers['cf-connecting-ip'] ?? 'unknown';

interface HttpRateLimitGuard extends RateLimitGuard {
  readonly message?: string;
  readonly key?: (request: HttpServerRequest.HttpServerRequest) => string;
}

export const withRateLimitGuard = <A, E, R>(
  guard: HttpRateLimitGuard,
  perRequest: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const throttle = yield* RateLimit(guard);
    const keyOf = guard.key ?? byConnectingIp;

    return Effect.succeed(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        yield* checkRateLimit(throttle, keyOf(request));
        return yield* perRequest;
      }).pipe(
        Effect.catchTag('RateLimitExceeded', () =>
          Effect.succeed(
            tooManyRequests(
              guard.message ?? 'Too many requests. Slow down and try again.',
              guard.period,
            ),
          ),
        ),
      ),
    );
  }).pipe(Effect.provide(Cloudflare.RateLimitBinding));
