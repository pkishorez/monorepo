import { Context, type Effect } from 'effect';

/*
 * What a Connection's card tells Settings → Connections, as the list Provides it
 * to its cards.
 */
export class ConnectionCards extends Context.Service<
  ConnectionCards,
  {
    /** Forget was asked for the Connection `id`: the list asks first. */
    readonly forget: (id: string) => Effect.Effect<void>;
  }
>()('code/ConnectionCards') {}
