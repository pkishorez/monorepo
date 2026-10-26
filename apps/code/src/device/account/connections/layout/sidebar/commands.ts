import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { ConnectionFilter } from '../../store.ts';
import { Connections } from '../../connections.ts';
import { Preferences } from '../../../../store.ts';
import { Moves } from '../../connection/records/index.ts';

/*
 * What the sidebar asks for: the Connection it shows kept as the Account's
 * Connection Filter, its width kept in Preferences, the Connection List asked
 * again, and each Session put, through `Moves`.
 */

/** Keeps the Connection the sidebar shows, for its Account; a write that fails is lost. */
export const setConnectionFilter = Command.make('SetConnectionFilter', {
  args: Schema.Struct({
    accountId: Schema.String,
    connectionId: Schema.NullOr(Schema.String),
  }),
  run: ({ accountId, connectionId }) =>
    Effect.flatMap(ConnectionFilter, (filter) =>
      filter.set(accountId, connectionId),
    ).pipe(Effect.ignore),
});

/** Keeps the sidebar's width in Preferences; a write that fails is lost. */
export const setSidebarWidth = Command.make('SetSidebarWidth', {
  args: Schema.Struct({ width: Schema.Finite }),
  run: ({ width }) =>
    Effect.flatMap(Preferences, (store) => store.setSidebarWidth(width)).pipe(
      Effect.ignore,
    ),
});

/** Asks Cloud Connect for the Connections again now. */
export const reload = Command.make('ReloadConnections', {
  run: () => Effect.flatMap(Connections, (connections) => connections.reload),
});

const Put = Schema.Struct({
  connectionId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
});

/** Puts a Session through `Moves`, which asks its Connection at once. */
export const putMove = Command.make('PutMove', {
  args: Put,
  run: ({ connectionId, sessionId, settled }) =>
    Effect.flatMap(Moves, (moves) =>
      moves.put({ connectionId, sessionId }, settled),
    ),
});

/** The Session as synced is where it was put. */
export const agreed = Command.make('AgreedMove', {
  args: Put,
  run: ({ connectionId, sessionId, settled }) =>
    Effect.flatMap(Moves, (moves) =>
      moves.agreed({ connectionId, sessionId }, settled),
    ),
});
