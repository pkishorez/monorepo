import { Context, Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { Credentials, Server, Session, SignIn } from '../services/index.js';
import { Api, ApiView } from './api/index.js';
import { Expiry, ExpiryView } from './expiry/index.js';
import { Login, LoginView } from './login/index.js';

/** The root. Its State decides which half of the app exists at all. */
export const Auth = Node.make('Auth', {
  requires: { server: Server },
  state: Schema.TaggedUnion({
    Checking: {},
    Anonymous: {},
    Authenticated: { user: Schema.String, token: Schema.String },
  }),
  message: Schema.TaggedUnion({
    CheckedSession: { session: Schema.NullOr(Credentials) },
    LoggedIn: { user: Schema.String, token: Schema.String },
    LoggedOut: {},
  }),
  provides: { Anonymous: [SignIn], Authenticated: [Session] },
  children: {
    Anonymous: { login: Login },
    Authenticated: { api: Api, expiry: Expiry },
  },
}).build({
  init: () => ({ state: { _tag: 'Checking' } }),
  lifetime: {
    Checking: () =>
      Stream.fromEffect(
        Effect.gen(function* () {
          return yield* (yield* Server).checkSession;
        }),
      ).pipe(
        Stream.map((session) => ({ _tag: 'CheckedSession' as const, session })),
      ),
  },
  update: {
    Checking: {
      CheckedSession: ({ session }) => ({
        state: session
          ? { _tag: 'Authenticated', ...session }
          : { _tag: 'Anonymous' },
      }),
    },
    Anonymous: {
      LoggedIn: ({ user, token }) => ({
        state: { _tag: 'Authenticated', user, token },
      }),
    },
    Authenticated: {
      LoggedOut: () => ({ state: { _tag: 'Anonymous' } }),
    },
  },
  provides: {
    Anonymous: ({ send }) =>
      Context.make(SignIn, {
        complete: (credentials) => send({ _tag: 'LoggedIn', ...credentials }),
      }),
    Authenticated: ({ state, send }) =>
      Context.make(Session, {
        user: state.user,
        token: state.token,
        logOut: () => send({ _tag: 'LoggedOut' }),
      }),
  },
});

export const AuthView = View.make(Auth, {
  Checking: () => (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Spinner />
      Checking for a session…
    </div>
  ),
  Anonymous: ({ children }) => <LoginView node={children.login} />,
  Authenticated: ({ state, children }) => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary uppercase"
        >
          {state.user.slice(0, 1) || '?'}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{state.user}</span>
          <span className="text-xs text-muted-foreground">Signed in</span>
        </div>
      </div>
      <ExpiryView node={children.expiry} />
      <div className="h-px bg-border" />
      <ApiView node={children.api} />
    </div>
  ),
});
