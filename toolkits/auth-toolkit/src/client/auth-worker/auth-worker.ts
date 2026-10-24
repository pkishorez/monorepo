import { Effect, Schema } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from 'effect/http';
import {
  AuthWorkerRejected,
  AuthWorkerUnavailable,
} from '../accounts/index.js';
import { authWorkerApiUrl } from '../../contract/index.js';

/** Why a call to the Auth Worker failed. */
export type AuthWorkerFailure = AuthWorkerUnavailable | AuthWorkerRejected;

interface Options {
  /** Sent on every call: a Device names itself to the Home Page with it. */
  readonly userAgent?: string;
  /** `'include'` sends the browser's cookie. */
  readonly credentials?: RequestCredentials;
}

interface Call {
  /** Sent as `Authorization: Bearer`. */
  readonly bearer?: string;
  /** Statuses besides 2xx whose body is still the answer. */
  readonly accept?: ReadonlyArray<number>;
}

const Refusal = Schema.Struct({
  message: Schema.optionalKey(Schema.String),
  code: Schema.optionalKey(Schema.String),
});

/** JSON calls to an Auth Worker's API (`${url}/api/auth`), each failure
 * named: unreachable, unavailable (5xx), rejected (4xx) or unreadable. */
export const authWorker = (url: string, options: Options = {}) =>
  Effect.map(HttpClient.HttpClient, (client) => {
    const init: RequestInit = options.credentials
      ? { credentials: options.credentials }
      : {};

    const rejected = (response: HttpClientResponse.HttpClientResponse) =>
      response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Refusal)),
        Effect.orElseSucceed((): typeof Refusal.Type => ({})),
        Effect.flatMap(({ message, code }) =>
          Effect.fail(
            new AuthWorkerRejected({
              url,
              status: response.status,
              ...(message ? { reason: message } : {}),
              ...(code ? { code } : {}),
            }),
          ),
        ),
      );

    const send = <A, I>(
      request: HttpClientRequest.HttpClientRequest,
      schema: Schema.Codec<A, I, never, never>,
      { bearer, accept = [] }: Call,
    ): Effect.Effect<A, AuthWorkerFailure> =>
      client
        .execute(
          request.pipe(
            options.userAgent
              ? HttpClientRequest.setHeader('user-agent', options.userAgent)
              : (same) => same,
            bearer ? HttpClientRequest.bearerToken(bearer) : (same) => same,
          ),
        )
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, init),
          Effect.catchTag('HttpClientError', () =>
            Effect.fail(
              new AuthWorkerUnavailable({ url, kind: 'unreachable' }),
            ),
          ),
          Effect.flatMap((response): Effect.Effect<A, AuthWorkerFailure> => {
            const ok =
              (response.status >= 200 && response.status < 300) ||
              accept.includes(response.status);
            if (ok) {
              return response.json.pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(schema)),
                Effect.mapError(
                  () => new AuthWorkerUnavailable({ url, kind: 'unreadable' }),
                ),
              );
            }
            return response.status >= 500
              ? Effect.fail(
                  new AuthWorkerUnavailable({
                    url,
                    kind: 'server-error',
                    status: response.status,
                  }),
                )
              : rejected(response);
          }),
        );

    return {
      get: <A, I>(
        path: string,
        schema: Schema.Codec<A, I, never, never>,
        call: Call = {},
      ) =>
        send(HttpClientRequest.get(authWorkerApiUrl(url, path)), schema, call),
      post: <A, I>(
        path: string,
        body: unknown,
        schema: Schema.Codec<A, I, never, never>,
        call: Call = {},
      ) =>
        send(
          HttpClientRequest.post(authWorkerApiUrl(url, path)).pipe(
            HttpClientRequest.bodyJsonUnsafe(body),
          ),
          schema,
          call,
        ),
    };
  });

export type AuthWorker = Effect.Success<ReturnType<typeof authWorker>>;
