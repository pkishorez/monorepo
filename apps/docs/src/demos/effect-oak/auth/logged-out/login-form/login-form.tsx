import { Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Label } from '@kstackz/web-platform/components/label';
import { AuthServer } from '../../auth-server/index.js';
import { SignIn } from '../../session/index.js';

/*
 * The login form: Editing, then Submitting while the AuthServer answers.
 * A good answer goes up through SignIn, a Request, and the app moves to
 * LoggedIn, which destroys this form. A bad one comes back as a Message.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with the form, or null when it can be sent. */
const problem = (email: string, password: string) =>
  !EMAIL.test(email)
    ? 'Please enter a valid email'
    : password === ''
      ? 'Password is required'
      : null;

const logIn = (email: string, password: string) =>
  Effect.gen(function* () {
    const session = yield* (yield* AuthServer).login(email, password);
    (yield* SignIn).complete(session);
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ _tag: 'FailedLogin' as const, error }),
    ),
  );

export const LoginForm = Node.make('LoginForm', {
  requires: { server: AuthServer, signIn: SignIn },
  model: Schema.Struct({ email: Schema.String, password: Schema.String }),
  state: Schema.TaggedUnion({
    Editing: { error: Schema.NullOr(Schema.String) },
    Submitting: {},
  }),
  message: Schema.TaggedUnion({
    ChangedEmail: { value: Schema.String },
    ChangedPassword: { value: Schema.String },
    SubmittedForm: {},
    FailedLogin: { error: Schema.String },
  }),
}).build({
  init: () => ({
    model: { email: '', password: '' },
    state: { _tag: 'Editing', error: null },
  }),
  update: {
    Editing: {
      ChangedEmail: ({ value }, { model }) => ({
        model: { ...model, email: value },
      }),
      ChangedPassword: ({ value }, { model }) => ({
        model: { ...model, password: value },
      }),
      SubmittedForm: (_, { model }) => {
        const error = problem(model.email, model.password);
        return error !== null
          ? { state: { _tag: 'Editing', error } }
          : {
              state: { _tag: 'Submitting' },
              commands: [logIn(model.email, model.password)],
            };
      },
    },
    Submitting: {
      FailedLogin: ({ error }, { model }) => ({
        model: { ...model, password: '' },
        state: { _tag: 'Editing', error },
      }),
    },
  },
});

const Form = ({
  email,
  password,
  error = null,
  submitting = false,
  send,
}: {
  readonly email: string;
  readonly password: string;
  readonly error?: string | null;
  readonly submitting?: boolean;
  readonly send: (
    message:
      | { readonly _tag: 'ChangedEmail'; readonly value: string }
      | { readonly _tag: 'ChangedPassword'; readonly value: string }
      | { readonly _tag: 'SubmittedForm' },
  ) => void;
}) => (
  <form
    className="flex flex-col gap-4"
    onSubmit={(event) => {
      event.preventDefault();
      send({ _tag: 'SubmittedForm' });
    }}
  >
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="login-email">Email</Label>
      <Input
        id="login-email"
        type="email"
        placeholder="you@example.com"
        value={email}
        disabled={submitting}
        onChange={(event) =>
          send({ _tag: 'ChangedEmail', value: event.target.value })
        }
      />
    </div>
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="login-password">Password</Label>
      <Input
        id="login-password"
        type="password"
        placeholder="password"
        value={password}
        disabled={submitting}
        aria-invalid={error !== null}
        onChange={(event) =>
          send({ _tag: 'ChangedPassword', value: event.target.value })
        }
      />
    </div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={submitting}>
      {submitting ? 'Signing in…' : 'Sign in'}
    </Button>
    <p className="text-xs text-muted-foreground">
      Any email works; the password is “password”.
    </p>
  </form>
);

export const LoginFormView = View.make(LoginForm, {
  Editing: ({ model, state, send }) => (
    <Form {...model} error={state.error} send={send} />
  ),
  Submitting: ({ model, send }) => <Form {...model} submitting send={send} />,
});
