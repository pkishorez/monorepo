import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Machines } from '../../../../../layer/capabilities/index.ts';

/*
 * What a Machine's Harness Accounts ask of its Machine Kit.
 */

/** Asks the Machine's Kit to ask the Machine again. */
export const refresh = Command.make('RetryAccounts', {
  args: Schema.Struct({ machineId: Schema.String }),
  run: ({ machineId }) =>
    Effect.flatMap(Machines, (machines) => machines.refresh(machineId)),
});
