import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Navigation } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Card, CardContent } from '@kestack/web-platform/components/card';
import { Field, FieldLabel } from '@kestack/web-platform/components/field';
import { Input } from '@kestack/web-platform/components/input';
import { PageFrame } from '../../components/index.ts';
import { Routes } from '../../../shared/index.ts';
import { Cookies } from '../../../shared/index.ts';

/** Writes the session cookie in the browser, then goes to the account, which reads it. */
const signIn = Command.make('sign in', {
  args: Schema.Struct({ name: Schema.String }),
  run: ({ name }) =>
    Effect.sync(() => Cookies.signIn(name)).pipe(
      Effect.andThen(
        Navigation.use((navigation) =>
          navigation.push(Routes.Account.Overview()),
        ),
      ),
    ),
});

const SignInActor = Actor.make('SignIn', {
  requires: [Navigation],
  props: Routes.SignIn.props,
  model: Schema.Struct({ name: Schema.String }),
  message: Schema.TaggedUnion({
    NameTyped: { name: Schema.String },
    Submitted: {},
  }),
}).build({
  init: () => ({ model: { name: 'Ada' } }),
  on: {
    NameTyped: ({ name }) => ({ model: { name } }),
    Submitted: (_, { model }) =>
      model.name.trim() ? { command: signIn({ name: model.name.trim() }) } : {},
  },
});

const SignInView = View.make(SignInActor, ({ model, send, root }) => (
  <div {...root}>
    <PageFrame
      place="SignIn"
      title="Sign in"
      intro="Any name will do: it is kept in a cookie this page writes, which the account's Loaders read from each request."
    >
      <Card className="max-w-sm">
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              send({ _tag: 'Submitted' });
            }}
          >
            <Field>
              <FieldLabel htmlFor="sign-in-name">Name</FieldLabel>
              <Input
                id="sign-in-name"
                name="name"
                autoComplete="nickname"
                value={model.name}
                onChange={(event) =>
                  send({ _tag: 'NameTyped', name: event.target.value })
                }
              />
            </Field>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageFrame>
  </div>
));

export const SignIn = { actor: SignInActor, view: SignInView };
