import { Effect, Schema } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Machine } from '@kestack/ai-toolkit/machines';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Command } from '@kestack/kabuki';
import { Store } from '@kestack/std-toolkit/replica';
import { Saved } from './saved.ts';

/*
 * What the Machine List asks of the Machines Backend, over HTTP and signed
 * by the Account signed in, and what it keeps on this device: each ends in
 * one Message. Forgetting a Machine deletes its records here too.
 */

const problemOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message) || 'The Machines Backend could not be reached'
    : 'The Machines Backend could not be reached';

/** The Account's Machines as the Backend lists them now, or why it could not. */
export const list = MachinesClient.use((client) => client.List({})).pipe(
  Effect.map((machines) => ({
    _tag: 'Fetched' as const,
    machines,
    at: Date.now(),
  })),
  Effect.catch((error) =>
    Effect.succeed({ _tag: 'Failed' as const, problem: problemOf(error) }),
  ),
);

export const save = Command.make('SaveMachines', {
  args: Schema.Struct({
    accountId: Schema.String,
    machines: Schema.Array(Machine),
  }),
  run: ({ accountId, machines }) =>
    Effect.flatMap(Saved, (saved) => saved.write(accountId, machines)),
});

/** Deletes a Machine's records on this device: best effort, as a tab may hold them. */
export const deleteRecords = (machineId: string) =>
  Effect.flatMap(Store, (store) => store.remove(Ai, machineId)).pipe(
    Effect.ignore,
  );

export const forget = Command.make('ForgetMachine', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    MachinesClient.use((client) => client.Forget({ id })).pipe(
      Effect.andThen(deleteRecords(id)),
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

/**
 * Signing an Account out of this device deletes the records of every
 * Machine it was last given here, and empties that list: best effort.
 */
export const signedOut = Command.make('MachinesSignedOut', {
  args: Schema.Struct({ accountIds: Schema.Array(Schema.String) }),
  run: ({ accountIds }) =>
    Effect.flatMap(Saved, (saved) =>
      Effect.forEach(
        accountIds,
        (accountId) =>
          saved.read(accountId).pipe(
            Effect.flatMap((machines) =>
              Effect.forEach(machines ?? [], ({ id }) => deleteRecords(id), {
                discard: true,
              }),
            ),
            Effect.andThen(saved.write(accountId, [])),
          ),
        { discard: true },
      ),
    ),
});
