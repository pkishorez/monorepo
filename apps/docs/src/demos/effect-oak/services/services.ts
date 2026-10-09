import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Credentials, Todo } from './server.js';

// What one Node gives the Nodes below it.

/** Provided while signed out: lets the login form finish signing in. */
export class SignIn extends Context.Service<
  SignIn,
  { readonly complete: (credentials: typeof Credentials.Type) => void }
>()('demos/effect-oak/SignIn') {}

/** Provided while signed in: who is signed in, and a Request to sign out. */
export class Session extends Context.Service<
  Session,
  {
    readonly user: string;
    readonly token: string;
    readonly logOut: () => void;
  }
>()('demos/effect-oak/Session') {}

/** Built from the Session's token: only Commands and Lifetimes run it. */
export class TodoApi extends Context.Service<
  TodoApi,
  {
    readonly list: Effect.Effect<ReadonlyArray<typeof Todo.Type>>;
    readonly add: (text: string) => Effect.Effect<typeof Todo.Type>;
    readonly toggle: (id: string) => Effect.Effect<void>;
  }
>()('demos/effect-oak/TodoApi') {}
