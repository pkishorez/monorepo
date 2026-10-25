import { Effect, Schema } from 'effect';
import { CloudClient, Machine } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import {
  dropEverywhere,
  SavedMachines,
} from '../../../layer/capabilities/index.ts';
import { problemOf } from './api.ts';

/*
 * What the Machines actor asks of Cloud Connect, and what it keeps
 * on this device: each ends in one Message, but for `drop` and `keep`. A
 * Machine forgotten, or gone from Cloud Connect's first list, has its
 * Instance stopped, in every tab, and its database and settings deleted.
 */

export const save = Command.make('SaveMachines', {
  args: Schema.Struct({
    accountId: Schema.String,
    machines: Schema.Array(Machine),
  }),
  run: ({ accountId, machines }) =>
    Effect.flatMap(SavedMachines, (saved) => saved.write(accountId, machines)),
});

export const forget = Command.make('ForgetMachine', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    CloudClient.use((client) => client.Forget({ id })).pipe(
      Effect.as({ _tag: 'Forgot' as const, id }),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'ForgetFailed' as const,
          id,
          problem: problemOf(error),
        }),
      ),
    ),
});

/** A forgotten Machine's records, settings and Saved Drafts go, and no other's, once it has left the list. */
export const drop = Command.make('DropMachineRecords', {
  args: Schema.Struct({ accountId: Schema.String, id: Schema.String }),
  run: ({ accountId, id }) =>
    dropEverywhere({ _tag: 'Machine', accountId, machineId: id }),
});

/** Keeps the records, settings and Saved Drafts of the Machines listed for the Account, and deletes the rest. */
export const keep = Command.make('KeepMachineRecords', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineIds: Schema.Array(Schema.String),
  }),
  run: ({ accountId, machineIds }) =>
    dropEverywhere({ _tag: 'Unlisted', accountId, listed: machineIds }),
});
