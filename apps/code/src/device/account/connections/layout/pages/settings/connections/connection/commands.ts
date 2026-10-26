import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { ConnectionCards } from '../store.ts';

/*
 * What a Connection's card tells Settings → Connections, through `ConnectionCards`.
 */

/** Asks to forget the Connection `id`. */
export const askForget = Command.make('AskForget', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) => Effect.flatMap(ConnectionCards, (cards) => cards.forget(id)),
});
