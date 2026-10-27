import { Effect, Schema } from 'effect';
import { CloudClient, Machine } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { Cache, dropEverywhere, shelf, Sync } from './machine/store/index.ts';
import { Storage } from '../store/index.ts';

/*
 * What Machines asks of Cloud Connect, and what it keeps on this device.
 * The Machine List is read from Cloud Connect, over HTTP and signed by the
 * Account signed in (`list`). Each command ends in one Message, but for
 * `keepList`, `dropForgotten` and `pruneUnlisted`. A Machine forgotten has its Instance stopped, in every
 * tab, and its database deleted, all under it with it (`Gone`); one gone
 * from Cloud Connect's first list has its database pruned (`Storage`).
 */

/** Why Cloud Connect could not be asked, as a person reads it. */
export const problemOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message) || 'Cloud Connect could not be reached'
    : 'Cloud Connect could not be reached';

/** The Account's Machines as Cloud Connect lists them now, or why it could not, answering the ask `since`. */
export const list = (since: number) =>
  CloudClient.use((client) => client.List({})).pipe(
    Effect.map((machines) => ({
      _tag: 'Fetched' as const,
      since,
      machines,
      at: Date.now(),
    })),
    Effect.catch((error) =>
      Effect.succeed({
        _tag: 'Failed' as const,
        since,
        problem: problemOf(error),
      }),
    ),
  );

/** The Account's Machine List as kept, in its database's `machines` table. */
export const ListShelf = shelf('machines', 1, Schema.Array(Machine));

/** Keeps the list for the Account; a write that fails is lost. */
export const keepList = Command.make('KeepMachineList', {
  args: Schema.Struct({
    accountId: Schema.String,
    machines: Schema.Array(Machine),
  }),
  run: ({ accountId, machines }) =>
    Effect.flatMap(Cache, (kept) =>
      kept.write(
        ListShelf,
        { accountId, machineId: null, projectId: null },
        machines,
      ),
    ),
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

/** A forgotten Machine's database goes, all under it, and no other's, once it has left the list. */
export const dropForgotten = Command.make('DropForgottenMachine', {
  args: Schema.Struct({ accountId: Schema.String, id: Schema.String }),
  run: ({ accountId, id }) =>
    dropEverywhere({ _tag: 'Machine', accountId, machineId: id }),
});

/**
 * Deletes the database of every Machine of the Account not listed, and
 * all under it, then keeps each listed one's Store to its own Instance.
 * Run to its end once begun.
 */
export const pruneUnlisted = Command.make('PruneUnlistedMachines', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineIds: Schema.Array(Schema.String),
  }),
  run: ({ accountId, machineIds }) =>
    Effect.gen(function* () {
      yield* (yield* Storage).pruneMachines(accountId, machineIds);
      yield* (yield* Sync).prune(accountId, machineIds);
    }).pipe(Effect.uninterruptible),
});
