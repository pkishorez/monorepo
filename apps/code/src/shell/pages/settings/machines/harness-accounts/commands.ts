import { Effect, Schema } from 'effect';
import { HarnessAccountInfo } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { SavedMachines } from '../../../../../layer/capabilities/index.ts';

/*
 * What a Machine's Harness Accounts keep on this device of what it said.
 */

/** Keeps a Machine's accounts as it said them, for its Account; a write that fails is lost. */
export const keepHarnessAccounts = Command.make('KeepHarnessAccounts', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineId: Schema.String,
    accounts: Schema.Array(HarnessAccountInfo),
  }),
  run: ({ accountId, machineId, accounts }) =>
    Effect.flatMap(SavedMachines, (saved) =>
      saved.keepSettings(accountId, machineId, { accounts }),
    ),
});
