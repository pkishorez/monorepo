import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Connections } from '../../../../connections.ts';

/*
 * What Settings → Connections asks of the Connection List, through `Connections`.
 */

/** Asks the Connection List again, or to forget a Connection. */

export const ask = Command.make('AskConnections', {
  args: Schema.Struct({ forget: Schema.NullOr(Schema.String) }),
  run: ({ forget }) =>
    Effect.flatMap(Connections, (connections) =>
      forget === null ? connections.reload : connections.forget(forget),
    ),
});

/** Done with a Forget that failed. */
export const keepForgetting = Command.make('KeepForgetting', {
  run: () =>
    Effect.flatMap(Connections, (connections) => connections.keepForgetting),
});
