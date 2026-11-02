import { Effect, Schema } from 'effect';
import { CloudClient } from '@kestack/connect/cloud';
import { Command } from '@kestack/kabuki';
import { Connections } from '../../../../../connections.ts';
import { ConnectionCards } from '../store.ts';

/*
 * What a Connection's card asks: Forget, of Settings → Connections, through
 * `ConnectionCards`; Rename, of Cloud Connect, then told to the Connection
 * List, so every name of it shows the new one at once.
 */

/** Asks to forget the Connection `id`. */
export const askForget = Command.make('AskForget', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) => Effect.flatMap(ConnectionCards, (cards) => cards.forget(id)),
});

/** Gives the Connection `id` its Display Name, or none, for null. */
export const rename = Command.make('RenameConnection', {
  args: Schema.Struct({
    id: Schema.String,
    displayName: Schema.NullOr(Schema.String),
  }),
  run: ({ id, displayName }) =>
    CloudClient.use((client) => client.Rename({ id, displayName })).pipe(
      Effect.andThen(
        Effect.flatMap(Connections, (connections) =>
          connections.renamed(id, displayName),
        ),
      ),
      Effect.as({ _tag: 'Renamed' as const }),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'RenameFailed' as const,
          problem: error.message || 'Cloud Connect could not be reached',
        }),
      ),
    ),
});
