import { Context, Effect, Layer, Schema } from 'effect';
import { Session } from '../session/index.js';

/*
 * The fake backend: a login that takes a second and accepts any email with
 * the password "password", and the saved session in localStorage.
 */

const LOGIN_DELAY_MS = 1000;
const KEY = 'effect-oak/auth-session';
const Json = Schema.fromJsonString(Schema.toCodecJson(Session));

export class AuthServer extends Context.Service<
  AuthServer,
  {
    readonly login: (
      email: string,
      password: string,
    ) => Effect.Effect<Session, string>;
    /** The session saved on an earlier visit, if any. */
    readonly loadSession: Effect.Effect<Session | null>;
    readonly saveSession: (session: Session) => Effect.Effect<void, string>;
    readonly clearSession: Effect.Effect<void, string>;
  }
>()('docs/auth/AuthServer') {}

const storage = (run: () => void) =>
  Effect.try({ try: run, catch: (cause) => String(cause) });

export const AuthServerLive = Layer.succeed(AuthServer, {
  login: (email, password) =>
    Effect.sleep(LOGIN_DELAY_MS).pipe(
      Effect.andThen(
        password === 'password'
          ? Effect.succeed({
              userId: '1',
              email,
              name: email.split('@')[0] ?? email,
            })
          : Effect.fail('Invalid credentials'),
      ),
    ),
  loadSession: Effect.suspend(() => {
    const saved = localStorage.getItem(KEY);
    return saved === null
      ? Effect.succeed(null)
      : Schema.decodeEffect(Json)(saved).pipe(Effect.orElseSucceed(() => null));
  }),
  saveSession: (session) =>
    Schema.encodeEffect(Json)(session).pipe(
      Effect.mapError(String),
      Effect.flatMap((json) => storage(() => localStorage.setItem(KEY, json))),
    ),
  clearSession: storage(() => localStorage.removeItem(KEY)),
});
