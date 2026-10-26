import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Machines } from '../../layer/capabilities/index.ts';

/*
 * Asking a Machine's Kit to ask its Machine again, as the project's
 * catalog and Settings' Harness Accounts ask it, through `Machines`.
 */

/** Asks the Machine's Kit to ask the Machine again. */
export const refreshKit = Command.make('RefreshKit', {
  args: Schema.Struct({ machineId: Schema.String }),
  run: ({ machineId }) =>
    Effect.flatMap(Machines, (machines) => machines.refresh(machineId)),
});
