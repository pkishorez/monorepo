import { Effect } from 'effect';
import { defineSession, type SessionContext } from '@kstackz/platform-toolkit';
import type { Entity } from '@kstackz/std-toolkit/core';
import type { AnyEntityESchema } from '@kstackz/std-toolkit/eschema';
import { inOrder, strategy } from '@kstackz/std-toolkit/sync';
import { apis, type Apis } from '../apis.ts';
import { Account, Category, Entry, Preferences } from '../model/index.ts';
import type { Session } from './types.ts';

// How often a Session asks for what other devices changed.
const POLL = '10 seconds';

type Kind = 'Accounts' | 'Categories' | 'Entries' | 'Preferences';

type Context = SessionContext<Apis>;

/** One user's money on this device: their Std Sync, kept in step with the
 * Backend the Ledger API reaches, each call signed with their token. */
const makeSession = ({ account, apis, sync }: Context): Session => {
  const { user } = account;
  const rpc = apis.ledger;

  // Each kind reads every change after the newest it has, and writes one
  // value at a time; the server answers with what it stored.
  const collectionOf = <S extends AnyEntityESchema>(kind: Kind, schema: S) => {
    type Value = S['Type'];
    // The kind's own RPCs by name: `Entries.Put`. Their types meet here.
    const call = <A>(name: string, payload: object) =>
      (
        rpc as unknown as Record<
          string,
          (payload: object) => Effect.Effect<A, unknown>
        >
      )[`${kind}.${name}`]!(payload);
    const id = (value: Value) =>
      (value as Record<string, string>)[schema.idField]!;
    // Each row's writes reach the Backend in the order they were made.
    const writeInOrder = inOrder();
    return sync.collection(schema, {
      sync: {
        global: strategy.oldToNew({
          fetch: ({ after }) =>
            call<ReadonlyArray<Entity<Value>>>('Changes', {
              after: after?.meta._u ?? null,
            }),
          pollEvery: POLL,
        }),
      },
      onInsert: (items) =>
        Effect.forEach(items, (value) =>
          writeInOrder(id(value), call<Entity<Value>>('Put', { value })),
        ),
      onUpdate: ({ current, updates }) =>
        writeInOrder(
          id(current),
          call<Entity<Value>>('Put', { value: { ...current, ...updates } }),
        ),
      onDelete: ({ current }) =>
        writeInOrder(
          id(current),
          call<Entity<Value>>('Delete', { id: id(current) }),
        ),
    });
  };

  // A command still running when the Session closes is interrupted, so it
  // never lands under whoever opens next.
  const command = <A>(run: (api: typeof rpc) => Effect.Effect<A, unknown>) =>
    Effect.runPromise(run(rpc));

  return {
    user,
    userId: user.id,
    accounts: collectionOf('Accounts', Account),
    categories: collectionOf('Categories', Category),
    entries: collectionOf('Entries', Entry),
    preferences: collectionOf('Preferences', Preferences),
    /**
     * Writes the sample Accounts and Categories, and with `entries` three
     * Months of Entries, unless the user has Accounts already.
     */
    sample: (entries: boolean) =>
      command((rpc) => rpc['Ledger.Sample']({ entries })),
    /** Deletes every Account, Category and Entry. */
    clear: () => command((rpc) => rpc['Ledger.Clear']({})),
  };
};

/**
 * The Session: what one signed-in user gets, over the Backend Ledger runs
 * on. The Platform opens it when they become active and closes it, with
 * their Std Sync, when they stop being active. `ledgerSession.use()` reads
 * it under `SignedIn`; `yield* ledgerSession.Service` from Effect code.
 */
export const ledgerSession = defineSession(apis, (context) =>
  Effect.sync(() => makeSession(context)),
);
