import { Effect, Schema } from 'effect';
import { CloudClient, Connection } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import {
  Cache,
  dropEverywhere,
  shelf,
  Sync,
} from './connection/store/index.ts';
import { Storage } from '../store/index.ts';

/*
 * What Connections asks of Cloud Connect, and what it keeps on this device.
 * The Connection List is read from Cloud Connect, over HTTP and signed by the
 * Account signed in (`list`). Each command ends in one Message, but for
 * `keepList`, `dropForgotten` and `pruneUnlisted`. A Connection forgotten has its Instance stopped, in every
 * tab, and its database deleted, all under it with it (`Gone`); one gone
 * from Cloud Connect's first list has its database pruned (`Storage`).
 */

/** Why Cloud Connect could not be asked, as a person reads it. */
export const problemOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message) || 'Cloud Connect could not be reached'
    : 'Cloud Connect could not be reached';

/** The Account's Connections as Cloud Connect lists them now, or why it could not, answering the ask `since`. */
export const list = (since: number) =>
  CloudClient.use((client) => client.List({})).pipe(
    Effect.map((connections) => ({
      _tag: 'Fetched' as const,
      since,
      connections,
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

/** The Account's Connection List as kept, in its database's `connections` table. */
export const ListShelf = shelf('connections', 1, Schema.Array(Connection));

/** Keeps the list for the Account; a write that fails is lost. */
export const keepList = Command.make('KeepConnectionList', {
  args: Schema.Struct({
    accountId: Schema.String,
    connections: Schema.Array(Connection),
  }),
  run: ({ accountId, connections }) =>
    Effect.flatMap(Cache, (kept) =>
      kept.write(
        ListShelf,
        { accountId, connectionId: null, projectId: null },
        connections,
      ),
    ),
});

export const forget = Command.make('ForgetConnection', {
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

/** A forgotten Connection's database goes, all under it, and no other's, once it has left the list. */
export const dropForgotten = Command.make('DropForgottenConnection', {
  args: Schema.Struct({ accountId: Schema.String, id: Schema.String }),
  run: ({ accountId, id }) =>
    dropEverywhere({ _tag: 'Connection', accountId, connectionId: id }),
});

/**
 * Deletes the database of every Connection of the Account not listed, and
 * all under it, then keeps each listed one's Store to its own Instance.
 * Run to its end once begun.
 */
export const pruneUnlisted = Command.make('PruneUnlistedConnections', {
  args: Schema.Struct({
    accountId: Schema.String,
    connectionIds: Schema.Array(Schema.String),
  }),
  run: ({ accountId, connectionIds }) =>
    Effect.gen(function* () {
      yield* (yield* Storage).pruneConnections(accountId, connectionIds);
      yield* (yield* Sync).prune(accountId, connectionIds);
    }).pipe(Effect.uninterruptible),
});
