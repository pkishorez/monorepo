import { Context, Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { AuthServer } from './auth-server/index.js';
import { LoggedInPages } from './logged-in/index.js';
import { LoggedOutPages } from './logged-out/index.js';
import { Session, SignedIn, SignIn } from './session/index.js';

/*
 * The app gate: Checking → LoggedOut ⇄ LoggedIn { session }.
 *
 * Checking reads a saved session in its Lifetime. LoggedOut Provides SignIn
 * and has the signed-out pages as its Child; LoggedIn Provides SignedIn and
 * has the signed-in pages. Leaving either destroys its whole site, so a
 * signed-out page can never be drawn with a session, nor the other way round.
 * Saving and clearing the session are Commands that report how they went.
 */

const save = (session: Session) =>
  Effect.gen(function* () {
    yield* (yield* AuthServer).saveSession(session);
    return { _tag: 'SucceededSaveSession' as const };
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ _tag: 'FailedSaveSession' as const, error }),
    ),
  );

const clear = Effect.gen(function* () {
  yield* (yield* AuthServer).clearSession;
  return { _tag: 'SucceededClearSession' as const };
}).pipe(
  Effect.catch((error) =>
    Effect.succeed({ _tag: 'FailedClearSession' as const, error }),
  ),
);

export const Auth = Node.make('Auth', {
  requires: { server: AuthServer },
  state: Schema.TaggedUnion({
    Checking: {},
    LoggedOut: {},
    LoggedIn: { session: Session },
  }),
  message: Schema.TaggedUnion({
    CheckedSession: { session: Schema.NullOr(Session) },
    SucceededLogin: { session: Session },
    RequestedLogout: {},
    SucceededSaveSession: {},
    FailedSaveSession: { error: Schema.String },
    SucceededClearSession: {},
    FailedClearSession: { error: Schema.String },
  }),
  provides: { LoggedOut: [SignIn], LoggedIn: [SignedIn] },
  children: {
    LoggedOut: { pages: LoggedOutPages },
    LoggedIn: { pages: LoggedInPages },
  },
}).build({
  init: () => ({ state: { _tag: 'Checking' } }),
  lifetime: {
    Checking: () =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const session = yield* (yield* AuthServer).loadSession;
          return { _tag: 'CheckedSession' as const, session };
        }),
      ),
  },
  provides: {
    LoggedOut: ({ send }) =>
      Context.make(SignIn, {
        complete: (session) => send({ _tag: 'SucceededLogin', session }),
      }),
    LoggedIn: ({ state, send }) =>
      Context.make(SignedIn, {
        session: state.session,
        logOut: () => send({ _tag: 'RequestedLogout' }),
      }),
  },
  update: {
    Checking: {
      CheckedSession: ({ session }) => ({
        state: session ? { _tag: 'LoggedIn', session } : { _tag: 'LoggedOut' },
      }),
    },
    LoggedOut: {
      SucceededLogin: ({ session }) => ({
        state: { _tag: 'LoggedIn', session },
        commands: [save(session)],
      }),
    },
    LoggedIn: {
      RequestedLogout: () => ({
        state: { _tag: 'LoggedOut' },
        commands: [clear],
      }),
    },
    '*': {
      SucceededSaveSession: () => ({}),
      FailedSaveSession: () => ({}),
      SucceededClearSession: () => ({}),
      FailedClearSession: () => ({}),
    },
  },
});

export { AuthServerLive as AuthLive } from './auth-server/index.js';
