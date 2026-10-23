import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Machines } from '../../../../layer/capabilities/index.ts';

/*
 * What Settings → Machines asks of the Machine List, through `Machines`.
 */

/** Asks the Machine List again, or to forget a Machine. */

export const ask = Command.make('AskMachines', {
  args: Schema.Struct({ forget: Schema.NullOr(Schema.String) }),
  run: ({ forget }) =>
    Effect.flatMap(Machines, (machines) =>
      forget === null ? machines.reload : machines.forget(forget),
    ),
});

/** Done with a Forget that failed. */
export const keepForgetting = Command.make('KeepForgetting', {
  run: () => Effect.flatMap(Machines, (machines) => machines.keepForgetting),
});
