import { Effect, Schema } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Machine } from '@kestack/ai-toolkit/machines';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Command } from '@kestack/kabuki';
import { Store } from '@kestack/std-toolkit/replica';
import { SavedMachines } from '../../../layer/capabilities/index.ts';
import { problemOf } from './api.ts';

/*
 * What the Machines actor asks of the Machines Backend, and what it keeps
 * on this device: each ends in one Message. A Machine forgotten takes its
 * records here with it: the Store stops its Instance, in every tab, and
 * deletes its database.
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
    MachinesClient.use((client) => client.Forget({ id })).pipe(
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

/** A forgotten Machine's records go, once it has left the list. */
export const drop = Command.make('DropMachineRecords', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(Store, (store) => Effect.ignore(store.remove(Ai, id))),
});
