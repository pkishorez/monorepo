import { Context } from 'effect';
import type { Effect } from 'effect';

/** What App Provides to everything below it: the Request that signs a user in. */
export class Session extends Context.Service<
  Session,
  { readonly signIn: (name: string) => Effect.Effect<void> }
>()('kabuki-routing/app/Session') {}
