import { Context, Effect, Layer } from 'effect';
import { CodeReplica } from '@kestack/connect/code';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Store } from '@kestack/std-toolkit/replica';
import { Store as IdbStore } from '@kestack/std-toolkit/replica/idb';
import { Store as MemoryStore } from '@kestack/std-toolkit/replica/memory';
import { accounts, Storage } from '../../../store/index.ts';
import { connection, connections } from '../../store.ts';
import { Cache } from './cache/index.ts';
import { SavedDrafts } from './local/drafts/index.ts';
import { Seen } from './local/seen/index.ts';
import { type Gone, placed } from '../../../store/rows/index.ts';

/*
 * What one Connection keeps on this device, in its database,
 * `code:account:<accountId>:connection:<connectionId>` (named by its Connections,
 * `../../store.ts`), and under it: copies of what it said (`cache/`), what
 * only this device knows of its Sessions (`local/`), and its records.
 *
 * 1. Sync     each Connection's records, the live copy the backend keeps up to
 *             date: one Replica Store per Connection, each made the first
 *             time it is asked for and shared after, under
 *             `…:connection:<connectionId>:sync:`, so what one Connection keeps is
 *             pruned without touching another's, and goes with the
 *             Connection. Each Connection Actor Provides its own to the Replicas
 *             it places; each Store is kept to its own Instance of
 *             `CodeReplica`, so one of an older projection goes, in every
 *             tab; a Connection forgotten has its Instance stopped here and
 *             in every other tab, then deleted.
 * 2. Gone     what the user asked to go, told to every store, then, for a
 *             Connection, its database deleted.
 * 3. Storage  the databases in this browser's IndexedDB, by each level's
 *             names: a level pruned is every database under its prefix
 *             whose next segment is not kept, deleted by its name, so
 *             nothing of what is under it is named here; `code:device` is
 *             under no Account, and an Account's own database under none
 *             of its Connections. A Connection forgotten has what is under it
 *             deleted first, then its own; open connections close
 *             themselves on the version change a delete raises, so it
 *             completes rather than staying blocked.
 */

// 1. Sync
/** The prefix of one Connection's sync Stores: a Replica Instance's name follows it. */
export const sync = (accountId: string, connectionId: string) =>
  `${connection(accountId, connectionId)}:sync:`;

/** The Capability that gives each Connection its Store, and says which records this device keeps. */
export class Sync extends Context.Service<
  Sync,
  {
    /** The Connection's Store: one per Connection, shared by all who ask for it. */
    readonly store: (
      accountId: string,
      connectionId: string,
    ) => Layer.Layer<Store>;
    /**
     * Keeps each Connection's Store to the Instance of its Connection of the one
     * Replica named, so one of an older projection goes, best effort.
     */
    readonly prune: (
      accountId: string,
      connectionIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /**
     * A Connection forgotten: its Instance is stopped here and in every other
     * tab, and its records deleted, best effort; its database goes after
     * (`Storage`). A Project has none of its own.
     */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/Sync') {}

const warn = (what: string) => (error: unknown) =>
  Effect.logWarning(`[code] could not ${what}`, error);

const make = (storeOf: (prefix: string) => Layer.Layer<Store>) => {
  // 1. Store
  const store = (accountId: string, connectionId: string) =>
    storeOf(sync(accountId, connectionId));

  return Sync.of({
    store,
    // 2. Prune: each on its own, so one that fails keeps no other.
    prune: (accountId, connectionIds) =>
      Effect.forEach(
        connectionIds,
        (connectionId) =>
          Effect.flatMap(Store, (each) =>
            each.prune([[CodeReplica, [connectionId]]]),
          ).pipe(
            Effect.provide(store(accountId, connectionId)),
            Effect.catch(
              warn(`prune the records of Connection ${connectionId}`),
            ),
          ),
        { discard: true },
      ),
    // 3. Drop
    drop: (gone) =>
      gone._tag === 'Project'
        ? Effect.void
        : Effect.flatMap(Store, (each) =>
            each.remove(CodeReplica, gone.connectionId),
          ).pipe(
            Effect.provide(store(gone.accountId, gone.connectionId)),
            Effect.catch(
              warn(`delete the records of Connection ${gone.connectionId}`),
            ),
          ),
  });
};

/** Each Connection's records in this browser's IndexedDB. */
export const syncIdb = Layer.effect(
  Sync,
  Effect.sync(() => make(placed((prefix) => IdbStore.idb({ prefix })))),
);

/** Each Connection's records in memory, for a test: each Layer built over the same Stores. */
export const syncMemory = () => {
  const storeOf = placed(() => MemoryStore.memory());
  return Layer.effect(
    Sync,
    Effect.sync(() => make(storeOf)),
  );
};

// 2. Gone
/**
 * Tells every store what went, then, for a Connection, deletes its database.
 * Once begun it runs to its end, even as the page that asked it goes.
 */
export const dropEverywhere = (gone: Gone) =>
  Effect.gen(function* () {
    // 1. Project, 2. Connection
    yield* (yield* Sync).drop(gone);
    yield* (yield* Seen).drop(gone);
    yield* (yield* Cache).drop(gone);
    yield* (yield* SavedDrafts).drop(gone);
    // 2. Connection
    if (gone._tag === 'Connection')
      yield* (yield* Storage).dropConnection(gone.accountId, gone.connectionId);
  }).pipe(Effect.uninterruptible);

// 3. Storage
/** Deletes one database by its name. */
const deleteDatabase = (name: string) =>
  Effect.callback<void, unknown>((resume) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resume(Effect.void);
    request.onerror = () => resume(Effect.fail(request.error));
  });

/** The databases of this browser's IndexedDB. */
export const storageIdb = Layer.succeed(Storage, {
  // 1. Accounts
  pruneAccounts: (signedIn) =>
    IDB.prune({ prefix: accounts, keep: signedIn }).pipe(
      Effect.catch(warn('delete Accounts signed out')),
      Effect.asVoid,
    ),
  // 2. Connections
  pruneConnections: (accountId, listed) =>
    IDB.prune({ prefix: connections(accountId), keep: listed }).pipe(
      Effect.catch(
        warn(`delete the Connections Account ${accountId} no longer lists`),
      ),
      Effect.asVoid,
    ),
  // 3. Forget: what is under it first, then its own.
  dropConnection: (accountId, connectionId) => {
    const own = connection(accountId, connectionId);
    return IDB.prune({ prefix: `${own}:`, keep: [] }).pipe(
      Effect.andThen(deleteDatabase(own)),
      Effect.catch(warn(`delete Connection ${connectionId}`)),
      Effect.asVoid,
    );
  },
});
