import { Effect } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { Greeting } from '../../shared/rpc/greeting/index.ts';

export const GreetingHandlers = Greeting.toLayer({
  Hello: ({ name }) =>
    Effect.map(
      Authz.CurrentAuth,
      ({ user }) =>
        `Hello, ${name ?? user.name}. You are signed in as ${user.email}.`,
    ),
  WhoAmI: () =>
    Effect.map(Authz.CurrentAuth, (principal) => ({
      kind: principal.kind,
      user: {
        id: principal.user.id,
        email: principal.user.email,
        name: principal.user.name,
      },
    })),
});
