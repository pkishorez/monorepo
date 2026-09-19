import { Data, Duration, Effect, Schedule, Schema } from 'effect';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http';

export class DeviceLoginFailed extends Data.TaggedError('DeviceLoginFailed')<{
  readonly reason: 'expired' | 'denied';
}> {}

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

const tokenOrFailure = ({
  access_token,
  error,
}: typeof DeviceToken.Type): Effect.Effect<
  string,
  Pending | DeviceLoginFailed
> => {
  if (access_token) return Effect.succeed(access_token);
  switch (error) {
    case 'authorization_pending':
    case 'slow_down':
      return Effect.fail(new Pending());
    case 'access_denied':
      return Effect.fail(new DeviceLoginFailed({ reason: 'denied' }));
    default:
      return Effect.fail(new DeviceLoginFailed({ reason: 'expired' }));
  }
};

export const makeAuthWorker = (authWorkerUrl: string) =>
  Effect.map(HttpClient.HttpClient, (client) => {
    const url = (path: string) =>
      `${authWorkerUrl.replace(/\/$/, '')}/api/auth${path}`;

    const post = (path: string, body: unknown) =>
      client.execute(
        HttpClientRequest.post(url(path)).pipe(
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      );

    const deviceCode = (clientId: string) =>
      post('/device/code', { client_id: clientId }).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceCode)),
        Effect.catchTag('SchemaError', Effect.die),
      );

    // The schedule already keeps to the interval, so `slow_down` just waits.
    const deviceToken = (clientId: string, code: DeviceCode) =>
      post('/device/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code.device_code,
        client_id: clientId,
      }).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceToken)),
        Effect.catchTag('SchemaError', Effect.die),
        Effect.flatMap(tokenOrFailure),
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
          Effect.flatMap(HttpClientResponse.schemaBodyJson(SessionBody)),
          Effect.catchTag('SchemaError', Effect.die),
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
