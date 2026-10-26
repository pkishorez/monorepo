import { Effect, Schema } from 'effect';
import { CloudClient, Machine } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import {
  dropEverywhere,
  Kept,
  shelf,
} from '../../../layer/capabilities/index.ts';
import { problemOf } from './api.ts';

/*
 * What the Machine List asks of Cloud Connect, and what it keeps on this
 * device: each ends in one Message, but for `keepList`, `dropForgotten`
 * and `dropUnlisted`. A Machine forgotten, or gone from Cloud Connect's
 * first list, has its Instance stopped, in every tab, and its records, its
 * Kit and its Unseen marks deleted; its Saved Drafts go only once it is
 * forgotten, since a list may come short (`Gone`).
 */

/** The Account's Machine List as kept. */
export const ListShelf = shelf('machine-list', 1, Schema.Array(Machine));

/** Keeps the list for the Account; a write that fails is lost. */
export const keepList = Command.make('KeepMachineList', {
  args: Schema.Struct({
    accountId: Schema.String,
    machines: Schema.Array(Machine),
  }),
  run: ({ accountId, machines }) =>
    Effect.flatMap(Kept, (kept) =>
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

/** A forgotten Machine's records, Kit, Saved Drafts and Unseen marks go, and no other's, once it has left the list. */
export const dropForgotten = Command.make('DropForgottenMachine', {
  args: Schema.Struct({ accountId: Schema.String, id: Schema.String }),
  run: ({ accountId, id }) =>
    dropEverywhere({ _tag: 'Machine', accountId, machineId: id }),
});

/**
 * Deletes the records, Kits and Unseen marks of the Account's Machines not
 * listed, and keeps their Saved Drafts.
 */
export const dropUnlisted = Command.make('DropUnlistedMachines', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineIds: Schema.Array(Schema.String),
  }),
  run: ({ accountId, machineIds }) =>
    dropEverywhere({ _tag: 'Unlisted', accountId, listed: machineIds }),
});
