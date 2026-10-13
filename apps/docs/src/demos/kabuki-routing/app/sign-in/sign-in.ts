import { Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Session } from '../capabilities/index.ts';

const signIn = Command.make('sign in', {
  args: Schema.Struct({ name: Schema.String }),
  run: ({ name }) => Session.use((session) => session.signIn(name)),
});

/** The sign-in form. Signing in is a Request to App, which owns who is signed in. */
export const SignInActor = Actor.make('SignIn', {
  requires: [Session],
  model: Schema.Struct({ name: Schema.String }),
  message: Schema.TaggedUnion({
    Named: { name: Schema.String },
    Submitted: {},
  }),
}).build({
  init: () => ({ model: { name: 'Ada' } }),
  on: {
    Named: ({ name }) => ({ model: { name } }),
    Submitted: (_, { model }) =>
      model.name.trim() ? { command: signIn({ name: model.name.trim() }) } : {},
  },
});
