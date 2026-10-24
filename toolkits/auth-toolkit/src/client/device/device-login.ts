import { Data, Duration, Effect, Schedule, Schema } from 'effect';
import {
  AuthWorkerRejected,
  AuthWorkerUnavailable,
  DeviceLoginFailed,
} from '../accounts/index.js';
import type { SourceAccount } from '../engine/index.js';
import type { AuthWorker } from '../auth-worker/index.js';

class Pending extends Data.TaggedError('Pending') {}

const Code = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  interval: Schema.Number,
});
type Code = typeof Code.Type;

const Token = Schema.Struct({
  access_token: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});

const Session = Schema.NullOr(
  Schema.Struct({
    user: Schema.Struct({
      id: Schema.String,
      email: Schema.String,
      name: Schema.String,
      image: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  }),
);

/** Where the Device Screen approves `code`, for the `account` hinted. */
export const verificationUrl = (
  url: string,
  code: string,
  account?: string,
): string => {
  const page = new URL('/device', url);
  page.searchParams.set('code', code);
  if (account) page.searchParams.set('account', account);
  return page.toString();
};

/** Device Login and the Sign-in token's life on one Auth Worker: a code for
 * `app`, polling until it is approved, who a token names, and revoking it. */
export const deviceLogin = (worker: AuthWorker, app: string, url: string) => {
  const requestCode = worker.post('/device/code', { client_id: app }, Code);

  // The schedule already keeps to the interval, so `slow_down` just waits.
  const awaitToken = (code: Code) =>
    worker
      .post(
        '/device/token',
        {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: code.device_code,
          client_id: app,
        },
        Token,
        { accept: [400] },
      )
      .pipe(
        Effect.flatMap(
          ({
            access_token,
            error,
          }): Effect.Effect<
            string,
            | Pending
            | DeviceLoginFailed
            | AuthWorkerRejected
            | AuthWorkerUnavailable
          > => {
            if (access_token) return Effect.succeed(access_token);
            switch (error) {
              case 'authorization_pending':
              case 'slow_down':
                return Effect.fail(new Pending());
              case 'access_denied':
                return Effect.fail(new DeviceLoginFailed({ reason: 'denied' }));
              case 'expired_token':
                return Effect.fail(
                  new DeviceLoginFailed({ reason: 'expired' }),
                );
              default:
                return Effect.fail(
                  error
                    ? new AuthWorkerRejected({
                        url,
                        status: 400,
                        reason: error,
                      })
                    : new AuthWorkerUnavailable({ url, kind: 'unreadable' }),
                );
            }
          },
        ),
        Effect.retry({
          while: (error) => error._tag === 'Pending',
          schedule: Schedule.spaced(Duration.seconds(code.interval)),
        }),
        Effect.catchTag('Pending', () =>
          Effect.fail(new DeviceLoginFailed({ reason: 'expired' })),
        ),
      );

  /** The Account a Sign-in token names; null once its Sign-in is gone. */
  const whoIs = (token: string) =>
    worker.get('/get-session', Session, { bearer: token }).pipe(
      Effect.map((session): SourceAccount | null =>
        session
          ? {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              image: session.user.image ?? null,
            }
          : null,
      ),
    );

  /** Ends a Sign-in on the Auth Worker. Best effort: a Device signing out
   * forgets the token either way. */
  const revoke = (token: string) =>
    Effect.ignore(
      worker.post('/sign-out', {}, Schema.Unknown, { bearer: token }),
    );

  return { requestCode, awaitToken, whoIs, revoke };
};
