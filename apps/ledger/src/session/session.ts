import { Effect, type Stream } from 'effect';
import {
  defineSession,
  type SessionContext,
} from '@kstackz/web-platform/define';
import type { Entity } from '@kstackz/std-toolkit/core';
import type { AnyEntityESchema } from '@kstackz/std-toolkit/eschema';
import { inOrder, strategy } from '@kstackz/std-toolkit/sync';
import { apis, type Apis } from '../apis.ts';
import { syncMode } from '../constants.ts';
import { Account, Category, Entry, Preferences } from '../model/index.ts';
import type { Session } from './types.ts';

// How often a Session asks for what other devices changed, when polling.
const POLL = '10 seconds';

type Context = SessionContext<Apis>;

type Cursor = string | null;

/** One kind's calls, as the Ledger API names them for it. */
interface Calls<V> {
  readonly changes: (input: {
    readonly after: Cursor;
  }) => Effect.Effect<ReadonlyArray<Entity<V>>, unknown>;
  readonly older: (input: {
    readonly before: Cursor;
  }) => Effect.Effect<ReadonlyArray<Entity<V>>, unknown>;
  readonly watch: (input: {
    readonly after: Cursor;
  }) => Stream.Stream<ReadonlyArray<Entity<V>>, unknown>;
  readonly put: (input: {
    readonly value: V;
  }) => Effect.Effect<Entity<V>, unknown>;
  readonly remove?: (input: {
    readonly id: string;
  }) => Effect.Effect<Entity<V>, unknown>;
}

const cursorOf = (entity: Entity<unknown> | null) => entity?.meta._u ?? null;

/** One user's money on this device: their Std Sync, kept in step with the
 * Backend the Ledger API reaches, each call signed with their token. */
const makeSession = ({ account, apis, sync }: Context): Session => {
  const { user } = account;
  const rpc = apis.ledger;

  // Each kind shows its newest page first, then fills in older ones, and
  // stays fresh by Sync Mode: told of each change as it is made, or asking
  // every so often. It writes one value at a time; the Backend answers
  // with what it stored.
  const collectionOf = <S extends AnyEntityESchema>(
    schema: S,
    calls: Calls<S['Type']>,
  ) => {
    type Value = S['Type'];
    const id = (value: Value) =>
      (value as Record<string, string>)[schema.idField]!;
    // Each row's writes reach the Backend in the order they were made.
    const writeInOrder = inOrder();
    const fetchOlder = ({
      before,
    }: {
      readonly before: Entity<Value> | null;
    }) => calls.older({ before: cursorOf(before) });
    const { remove } = calls;
    return sync.collection(schema, {
      sync: {
        global: strategy.newToOld(
          syncMode === 'realtime'
            ? {
                fetchOlder,
                subscribe: ({ after }) =>
                  calls.watch({ after: cursorOf(after) }),
              }
            : {
                fetchOlder,
                fetch: ({ after }) => calls.changes({ after: cursorOf(after) }),
                pollEvery: POLL,
              },
        ),
      },
      onInsert: (items) =>
        Effect.forEach(items, (value) =>
          writeInOrder(id(value), calls.put({ value })),
        ),
      onUpdate: ({ current, updates }) =>
        writeInOrder(
          id(current),
          calls.put({ value: { ...current, ...updates } }),
        ),
      ...(remove !== undefined && {
        onDelete: ({ current }: { readonly current: Value }) =>
          writeInOrder(id(current), remove({ id: id(current) })),
      }),
    });
  };

  // A command still running when the Session closes is interrupted, so it
  // never lands under whoever opens next.
  const command = <A>(run: (api: typeof rpc) => Effect.Effect<A, unknown>) =>
    Effect.runPromise(run(rpc));

  return {
    user,
    userId: user.id,
    accounts: collectionOf(Account, {
      changes: rpc.AccountChanges,
      older: rpc.AccountOlder,
      watch: rpc.AccountWatch,
      put: rpc.AccountPut,
      remove: rpc.AccountDelete,
    }),
    categories: collectionOf(Category, {
      changes: rpc.CategoryChanges,
      older: rpc.CategoryOlder,
      watch: rpc.CategoryWatch,
      put: rpc.CategoryPut,
      remove: rpc.CategoryDelete,
    }),
    entries: collectionOf(Entry, {
      changes: rpc.EntryChanges,
      older: rpc.EntryOlder,
      watch: rpc.EntryWatch,
      put: rpc.EntryPut,
      remove: rpc.EntryDelete,
    }),
    preferences: collectionOf(Preferences, {
      changes: rpc.PreferencesChanges,
      older: rpc.PreferencesOlder,
      watch: rpc.PreferencesWatch,
      put: rpc.PreferencesPut,
    }),
    /**
     * Writes the sample Accounts and Categories, and with `entries` three
     * Months of Entries, unless the user has Accounts already.
     */
    sample: (entries: boolean) =>
      command((rpc) => rpc.LedgerSample({ entries })),
    /** Deletes every Account, Category and Entry. */
    clear: () => command((rpc) => rpc.LedgerClear({})),
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
