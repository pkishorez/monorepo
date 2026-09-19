import { Data, Duration, Effect, Schedule, Schema } from 'effect';
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http';

export class DeviceLoginFailed extends Data.TaggedError('DeviceLoginFailed')<{
  readonly reason: 'expired' | 'denied';
}> {
  override get message() {
    return this.reason === 'denied'
      ? 'Sign-in was denied in the browser.'
      : 'The sign-in code expired before it was approved. Run login again.';
  }
}

export class AuthWorkerUnreachable extends Data.TaggedError(
  'AuthWorkerUnreachable',
)<{ readonly url: string }> {
  override get message() {
    return `Could not reach the sign-in service at ${this.url}. Check your connection and try again.`;
  }
}

export class AuthWorkerUnavailable extends Data.TaggedError(
  'AuthWorkerUnavailable',
)<{ readonly url: string; readonly status: number }> {
  override get message() {
    return `The sign-in service at ${this.url} is temporarily unavailable (HTTP ${this.status}). Try again in a moment.`;
  }
}

export class AuthWorkerRejected extends Data.TaggedError('AuthWorkerRejected')<{
  readonly url: string;
  readonly status: number;
}> {
  override get message() {
    return `The sign-in service at ${this.url} rejected the request (HTTP ${this.status}). Check its URL and configuration.`;
  }
}

export class InvalidAuthWorkerResponse extends Data.TaggedError(
  'InvalidAuthWorkerResponse',
)<{ readonly url: string }> {
  override get message() {
    return `The sign-in service at ${this.url} returned a response this CLI could not understand. The service and CLI may be incompatible.`;
  }
}

export type AuthWorkerFailure =
  | AuthWorkerUnreachable
  | AuthWorkerUnavailable
  | AuthWorkerRejected
  | InvalidAuthWorkerResponse;

class Pending extends Data.TaggedError('Pending') {}

export const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});
export type User = typeof User.Type;

const DeviceCode = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri_complete: Schema.String,
  interval: Schema.Number,
});
type DeviceCode = typeof DeviceCode.Type;

const DeviceToken = Schema.Struct({
  access_token: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});

const SessionBody = Schema.NullOr(Schema.Struct({ user: User }));

const tokenOrFailure = (
  { access_token, error }: typeof DeviceToken.Type,
  rejected: AuthWorkerRejected,
): Effect.Effect<
  string,
  Pending | DeviceLoginFailed | AuthWorkerRejected | InvalidAuthWorkerResponse
> => {
  if (access_token) return Effect.succeed(access_token);
  switch (error) {
    case 'authorization_pending':
    case 'slow_down':
      return Effect.fail(new Pending());
    case 'access_denied':
      return Effect.fail(new DeviceLoginFailed({ reason: 'denied' }));
    case 'expired_token':
      return Effect.fail(new DeviceLoginFailed({ reason: 'expired' }));
    default:
      return Effect.fail(
        error ? rejected : new InvalidAuthWorkerResponse({ url: rejected.url }),
      );
  }
};

export const makeAuthWorker = (authWorkerUrl: string, userAgent: string) =>
  Effect.map(HttpClient.HttpClient, (base) => {
    const client = base.pipe(
      HttpClient.mapRequest(
        HttpClientRequest.setHeader('user-agent', userAgent),
      ),
    );
    const url = (path: string) =>
      `${authWorkerUrl.replace(/\/$/, '')}/api/auth${path}`;

    const responseFailure = (status: number) =>
      status >= 500
        ? new AuthWorkerUnavailable({ url: authWorkerUrl, status })
        : new AuthWorkerRejected({ url: authWorkerUrl, status });

    const requestFailure = ({ reason }: HttpClientError.HttpClientError) =>
      Effect.fail(
        'response' in reason
          ? responseFailure(reason.response.status)
          : new AuthWorkerUnreachable({ url: authWorkerUrl }),
      );

    const expectOk = (response: HttpClientResponse.HttpClientResponse) =>
      response.status >= 200 && response.status < 300
        ? Effect.succeed(response)
        : Effect.fail(responseFailure(response.status));

    const post = (path: string, body: unknown) =>
      client.execute(
        HttpClientRequest.post(url(path)).pipe(
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      );

    const deviceCode = (clientId: string) =>
      post('/device/code', { client_id: clientId }).pipe(
        Effect.catchTag('HttpClientError', requestFailure),
        Effect.flatMap(expectOk),
        Effect.flatMap((response) =>
          HttpClientResponse.schemaBodyJson(DeviceCode)(response).pipe(
            Effect.mapError(
              () => new InvalidAuthWorkerResponse({ url: authWorkerUrl }),
            ),
          ),
        ),
      );

    // The schedule already keeps to the interval, so `slow_down` just waits.
    const deviceToken = (clientId: string, code: DeviceCode) =>
      post('/device/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code.device_code,
        client_id: clientId,
      }).pipe(
        Effect.catchTag('HttpClientError', requestFailure),
        Effect.flatMap((response) =>
          Effect.gen(function* () {
            if (response.status >= 500) {
              return yield* Effect.fail(responseFailure(response.status));
            }
            if (
              response.status !== 400 &&
              (response.status < 200 || response.status >= 300)
            ) {
              return yield* Effect.fail(responseFailure(response.status));
            }
            const body = yield* HttpClientResponse.schemaBodyJson(DeviceToken)(
              response,
            ).pipe(
              Effect.mapError(
                () => new InvalidAuthWorkerResponse({ url: authWorkerUrl }),
              ),
            );
            return yield* tokenOrFailure(
              body,
              new AuthWorkerRejected({
                url: authWorkerUrl,
                status: response.status,
              }),
            );
          }),
        ),
        Effect.retry({
          while: (error) => error._tag === 'Pending',
          schedule: Schedule.spaced(Duration.seconds(code.interval)),
        }),
        Effect.catchTag('Pending', () =>
          Effect.fail(new DeviceLoginFailed({ reason: 'expired' })),
        ),
      );

    const user = (token: string) =>
      client
        .execute(
          HttpClientRequest.get(url('/get-session')).pipe(
            HttpClientRequest.bearerToken(token),
          ),
        )
        .pipe(
          Effect.catchTag('HttpClientError', requestFailure),
          Effect.flatMap(expectOk),
          Effect.flatMap((response) =>
            HttpClientResponse.schemaBodyJson(SessionBody)(response).pipe(
              Effect.mapError(
                () => new InvalidAuthWorkerResponse({ url: authWorkerUrl }),
              ),
            ),
          ),
          Effect.map((body) => body?.user),
        );

    const signOut = (token: string) =>
      client
        .execute(
          HttpClientRequest.post(url('/sign-out')).pipe(
            HttpClientRequest.bearerToken(token),
            HttpClientRequest.bodyJsonUnsafe({}),
          ),
        )
        .pipe(Effect.ignore);

    return { deviceCode, deviceToken, user, signOut };
  });
