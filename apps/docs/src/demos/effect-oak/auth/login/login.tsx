import { Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import type { Snapshot } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Label } from '@kstackz/web-platform/components/label';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { CircleAlert } from 'lucide-react';
import { Server, SignIn } from '../../services/index.js';

/** The form keeps its fields in every State; only Editing accepts a submit. */
export const Login = Node.make('Login', {
  requires: { server: Server, signIn: SignIn },
  model: Schema.Struct({ name: Schema.String, password: Schema.String }),
  state: Schema.TaggedUnion({
    Editing: { error: Schema.NullOr(Schema.String) },
    Submitting: {},
  }),
  message: Schema.TaggedUnion({
    ChangedName: { name: Schema.String },
    ChangedPassword: { password: Schema.String },
    Submitted: {},
    Failed: { error: Schema.String },
  }),
}).build({
  init: () => ({
    model: { name: '', password: '' },
    state: { _tag: 'Editing', error: null },
  }),
  update: {
    Editing: {
      ChangedName: ({ name }, { model }) => ({ model: { ...model, name } }),
      ChangedPassword: ({ password }, { model }) => ({
        model: { ...model, password },
      }),
      Submitted: (_, { model }) => ({
        state: { _tag: 'Submitting' },
        commands: [
          Effect.gen(function* () {
            const server = yield* Server;
            const credentials = yield* server.login(model.name, model.password);
            (yield* SignIn).complete(credentials);
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed({ _tag: 'Failed' as const, error }),
            ),
          ),
        ],
      }),
    },
    Submitting: {
      Failed: ({ error }) => ({ state: { _tag: 'Editing', error } }),
    },
  },
});

const LoginForm = ({
  name,
  password,
  busy,
  error,
  send,
}: {
  readonly name: string;
  readonly password: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly send: Snapshot<typeof Login>['send'];
}) => (
  <form
    className="flex flex-col gap-5"
    onSubmit={(event) => {
      event.preventDefault();
      send({ _tag: 'Submitted' });
    }}
  >
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
      <p className="text-sm text-muted-foreground">
        Any name works. The password is “oak”.
      </p>
    </div>
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-name">Name</Label>
        <Input
          id="login-name"
          autoComplete="username"
          value={name}
          onChange={(event) =>
            send({ _tag: 'ChangedName', name: event.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          value={password}
          onChange={(event) =>
            send({ _tag: 'ChangedPassword', password: event.target.value })
          }
        />
        {error && (
          <p
            id="login-error"
            className="flex items-center gap-1.5 text-sm text-destructive"
          >
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </div>
    <Button type="submit" className="w-full">
      {busy && <Spinner />}
      {busy ? 'Signing in…' : 'Sign in'}
    </Button>
  </form>
);

export const LoginView = View.make(Login, {
  Editing: ({ model, state, send }) => (
    <LoginForm {...model} busy={false} error={state.error} send={send} />
  ),
  Submitting: ({ model, send }) => (
    <LoginForm {...model} busy error={null} send={send} />
  ),
});
