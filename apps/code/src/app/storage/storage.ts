import { Context, Effect, Layer, type Scope } from 'effect';
import { CodeReplica } from '@kestack/connect/code';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Store } from '@kestack/std-toolkit/replica';
import { Store as IdbStore } from '@kestack/std-toolkit/replica/idb';
import { Store as MemoryStore } from '@kestack/std-toolkit/replica/memory';
import {
  accounts,
  connection,
  connections,
  type Gone,
  placed,
  sync,
} from './database/index.ts';
import { type Cache, cacheIdb, cacheMemory } from './cache/index.ts';
import { type Seen, seenIdb, seenMemory } from './local/seen/index.ts';
import {
  type SavedDrafts,
  savedDraftsIdb,
  savedDraftsMemory,
} from './local/drafts/index.ts';

/*
 * What this device keeps, as one Capability, `Storage`, which `start.tsx`
 * Provides for as long as the page lives. Each database is named by its
 * place (`database/`), and each store is one of three kinds:
 *
 * 1. Local    what only this device knows, and is the truth (`local/`):
 *             each Connection's Unseen marks and Saved Drafts. The
 *             Preferences are Local too, in the device's own database,
 *             and their own Capability.
 * 2. Cache    copies of what Cloud Connect and each Connection last said
 *             (`cache/`): shown first, replaced by the next answer.
 * 3. Sync     each Connection's records, the live copy the backend keeps
 *             up to date: one Replica Store per Connection, each made the
 *             first time it is asked for and shared after, under
 *             `…:connection:<connectionId>:sync:`, so what one Connection
 *             keeps is pruned without touching another's. Each Connection
 *             Actor Provides its own to the Replicas it places; each Store
 *             is kept to its own Instance of `CodeReplica`, so one of an
 *             older projection goes, in every tab.
 *
 * Whoever checks a level deletes the children it no longer lists, never
 * itself, and only on a real answer: a failed or refused check deletes
 * nothing.
 *
 * 4. Prune    the Accounts not signed in here, once the Auth Worker has
 *             answered; an Account's Connections not listed, once Cloud
 *             Connect has first answered. A level pruned is every database
 *             under its prefix whose next segment is not kept, deleted by
 *             its name, so nothing of what is under it is named here.
 * 5. Forget   what the user asked to go, a Project removed or a Connection
 *             forgotten (`Gone`), at once: told to every store, then, for
 *             a Connection, its Instance stopped here and in every other
 *             tab, and its database deleted, what is under it first. Open
 *             connections close themselves on the version change a delete
 *             raises, so it completes rather than staying blocked.
 */

/** Each Connection's records, as its Replica Stores keep them. */
interface Sync {
  readonly store: (
    accountId: string,
    connectionId: string,
  ) => Layer.Layer<Store>;
  readonly prune: (
    accountId: string,
    connectionIds: ReadonlyArray<string>,
  ) => Effect.Effect<void>;
  readonly drop: (gone: Gone) => Effect.Effect<void>;
}

/** The databases themselves, deleted by their names. */
interface Databases {
  readonly pruneAccounts: (
    signedIn: ReadonlyArray<string>,
  ) => Effect.Effect<void>;
  readonly pruneConnections: (
    accountId: string,
    listed: ReadonlyArray<string>,
  ) => Effect.Effect<void>;
  readonly dropConnection: (
    accountId: string,
    connectionId: string,
  ) => Effect.Effect<void>;
}

/** What `Storage` is made of: each kind's store, and the databases. */
export interface Parts {
  readonly seen: Seen;
  readonly drafts: SavedDrafts;
  readonly cache: Cache;
  readonly sync: Sync;
  readonly databases: Databases;
}

/** What this device keeps: each kind's store, and pruning and forgetting by place. */
export class Storage extends Context.Service<
  Storage,
  {
    // 1. Local
    /** Each Connection's Unseen marks. */
    readonly seen: Omit<Seen, 'drop'>;
    /** Each place's Saved Draft. */
    readonly drafts: Omit<SavedDrafts, 'drop'>;
    // 2. Cache
    /** Each copy kept of what Cloud Connect or a Connection last said. */
    readonly cache: Omit<Cache, 'drop'>;
    // 3. Sync
    /** The Connection's Store: one per Connection, shared by all who ask for it. */
    readonly store: (
      accountId: string,
      connectionId: string,
    ) => Layer.Layer<Store>;
    // 4. Prune
    /**
     * Deletes every Account's databases but those of the Accounts signed
     * in on this device, and all under them. Best effort.
     */
    readonly pruneAccounts: (
      signedIn: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /**
     * Deletes the databases of every Connection of the Account but those
     * listed, and all under them, never the Account's own; then keeps each
     * listed one's Store to its own Instance. Best effort, and run to its
     * end once begun.
     */
    readonly pruneConnections: (
      accountId: string,
      listed: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    // 5. Forget
    /**
     * Tells every store what went, then, for a Connection, deletes its
     * database and all under it, and no other's. Once begun it runs to its
     * end, even as the page that asked it goes.
     */
    readonly forget: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/Storage') {}

const warn = (what: string) => (error: unknown) =>
  Effect.logWarning(`[code] could not ${what}`, error);

/** `Storage`, from its parts. */
export const storageOf = (parts: Parts): Storage['Service'] => ({
  seen: parts.seen,
  drafts: parts.drafts,
  cache: parts.cache,
  store: parts.sync.store,
  pruneAccounts: parts.databases.pruneAccounts,
  pruneConnections: (accountId, listed) =>
    Effect.gen(function* () {
      yield* parts.databases.pruneConnections(accountId, listed);
      yield* parts.sync.prune(accountId, listed);
    }).pipe(Effect.uninterruptible),
  forget: (gone) =>
    Effect.gen(function* () {
      // A Project, and a Connection
      yield* parts.sync.drop(gone);
      yield* parts.seen.drop(gone);
      yield* parts.cache.drop(gone);
      yield* parts.drafts.drop(gone);
      // A Connection
      if (gone._tag === 'Connection')
        yield* parts.databases.dropConnection(
          gone.accountId,
          gone.connectionId,
        );
    }).pipe(Effect.uninterruptible),
});

// 3. Sync
const syncOf = (storeOf: (prefix: string) => Layer.Layer<Store>): Sync => {
  const store = (accountId: string, connectionId: string) =>
    storeOf(sync(accountId, connectionId));
  return {
    store,
    // Each on its own, so one that fails keeps no other.
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
    // A Connection forgotten: its Instance is stopped here and in every
    // other tab, and its records deleted; a Project has none of its own.
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
  };
};

// 4. Prune, 5. Forget
/** Deletes one database by its name. */
const deleteDatabase = (name: string) =>
  Effect.callback<void, unknown>((resume) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resume(Effect.void);
    request.onerror = () => resume(Effect.fail(request.error));
  });

/** The databases of this browser's IndexedDB. */
const databasesIdb: Databases = {
  pruneAccounts: (signedIn) =>
    IDB.prune({ prefix: accounts, keep: signedIn }).pipe(
      Effect.catch(warn('delete Accounts signed out')),
      Effect.asVoid,
    ),
  pruneConnections: (accountId, listed) =>
    IDB.prune({ prefix: connections(accountId), keep: listed }).pipe(
      Effect.catch(
        warn(`delete the Connections Account ${accountId} no longer lists`),
      ),
      Effect.asVoid,
    ),
  // What is under it first, then its own.
  dropConnection: (accountId, connectionId) => {
    const own = connection(accountId, connectionId);
    return IDB.prune({ prefix: `${own}:`, keep: [] }).pipe(
      Effect.andThen(deleteDatabase(own)),
      Effect.catch(warn(`delete Connection ${connectionId}`)),
      Effect.asVoid,
    );
  },
};

/** Nothing to delete: what is in memory goes with the page. */
const databasesMemory: Databases = {
  pruneAccounts: () => Effect.void,
  pruneConnections: () => Effect.void,
  dropConnection: () => Effect.void,
};

/** `Storage` over its parts, each store made in the Layer's own Scope. */
const layerOf = (
  made: Effect.Effect<Parts, never, Scope.Scope>,
): Layer.Layer<Storage> => Layer.effect(Storage, Effect.map(made, storageOf));

/** What this device keeps, in this browser's IndexedDB. */
export const storageIdb = layerOf(
  Effect.gen(function* () {
    return {
      seen: yield* seenIdb,
      drafts: yield* savedDraftsIdb,
      cache: yield* cacheIdb,
      sync: syncOf(placed((prefix) => IdbStore.idb({ prefix }))),
      databases: databasesIdb,
    };
  }),
);

/**
 * What this device keeps, in memory, for a test: each Layer built over the
 * same rows and Stores. `over` changes the parts made, such as one store's
 * drop, to see what is asked of it.
 */
export const storageMemory = (
  over: (parts: Parts) => Partial<Parts> = () => ({}),
) => {
  const seen = seenMemory();
  const drafts = savedDraftsMemory();
  const cache = cacheMemory();
  const storeOf = placed(() => MemoryStore.memory());
  return layerOf(
    Effect.gen(function* () {
      const parts: Parts = {
        seen: yield* seen,
        drafts: yield* drafts,
        cache: yield* cache,
        sync: syncOf(storeOf),
        databases: databasesMemory,
      };
      return { ...parts, ...over(parts) };
    }),
  );
};
