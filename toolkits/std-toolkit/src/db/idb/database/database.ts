import { Effect } from 'effect';
import { CONTRACT_STORE, makeIDBSetup } from '../upgrade/index.js';

export interface IDBDatabaseConfig {
  readonly databaseName: string;
  readonly indexedDB?: IDBFactory;
}

export interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

/** One table store's Stored contract, as the contract store keeps it. */
export interface IDBStoredContract {
  readonly mode: 'persistent' | 'disposable';
  readonly hash: string;
  readonly snapshot: unknown;
}

export interface IDBConnection {
  readonly compare: (left: IDBValidKey, right: IDBValidKey) => number;
  readonly open: () => Promise<IDBDatabase>;
  readonly setup: (
    storeName: string,
    indexes: readonly IDBIndexDefinition[],
  ) => Effect.Effect<void, unknown>;
  /** Reads a table store's Stored contract, creating the contract store when missing. */
  readonly readContract: (
    storeName: string,
  ) => Effect.Effect<IDBStoredContract | undefined, unknown>;
  /**
   * Records a table store's contract, and with `wipe` removes every record
   * from it, in one transaction, only while the stored contract is still the
   * one read (`undefined` for none). False when another setup moved it.
   */
  readonly swapContract: (
    storeName: string,
    read: Pick<IDBStoredContract, 'mode' | 'hash'> | undefined,
    contract: IDBStoredContract,
    options: { readonly wipe: boolean },
  ) => Effect.Effect<boolean, unknown>;
}

const completed = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const requested = <A>(request: IDBRequest<A>) =>
  new Promise<A>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const connections = new WeakMap<IDBFactory, Map<string, IDBConnection>>();
const defaultConnections = new Map<string, IDBConnection>();

const resolveFactory = (configuration: IDBDatabaseConfig) => {
  const factory = configuration.indexedDB ?? globalThis.indexedDB;
  if (factory === undefined)
    throw new Error('IndexedDB is not available in this environment');
  return factory;
};

// How long an upgrade waits on the connections it is blocked by.
const BLOCKED_FOR = 3000;

const openDatabase = (
  factory: IDBFactory,
  name: string,
  version?: number,
  upgrade?: (database: IDBDatabase, transaction: IDBTransaction) => void,
  onVersionChange?: (database: IDBDatabase) => void,
) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      reject(cause);
    };
    const request =
      version === undefined ? factory.open(name) : factory.open(name, version);
    request.onerror = () => fail(request.error);
    // Blocked is often only for a moment: a connection still opening at the
    // old version closes once it sees the version change. Only one that
    // stays open (another tab that never lets go) fails the open.
    request.onblocked = () =>
      setTimeout(
        () => fail(new Error(`IndexedDB database "${name}" is blocked`)),
        BLOCKED_FOR,
      );
    request.onupgradeneeded = () => {
      const transaction = request.transaction;
      if (transaction === null)
        return fail(
          new Error(`IndexedDB upgrade for "${name}" has no transaction`),
        );
      try {
        upgrade?.(request.result, transaction);
      } catch (cause) {
        transaction.abort();
        fail(cause);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        onVersionChange?.(database);
      };
      resolve(database);
    };
  });

const isVersionError = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'name' in cause &&
  cause.name === 'VersionError';

const makeConnection = (configuration: IDBDatabaseConfig): IDBConnection => {
  let current: Promise<IDBDatabase> | undefined;
  let generation = 0;
  const open = (
    version?: number,
    upgrade?: Parameters<typeof openDatabase>[3],
  ) => {
    const factory = resolveFactory(configuration);
    const openedGeneration = ++generation;
    const invalidate = () => {
      if (generation === openedGeneration) current = undefined;
    };
    const opened = openDatabase(
      factory,
      configuration.databaseName,
      version,
      upgrade,
      invalidate,
    );
    const cached = opened.catch((cause) => {
      if (generation === openedGeneration) current = undefined;
      throw cause;
    });
    current = cached;
    return cached;
  };
  const getCurrent = () => current ?? open();
  const setup = makeIDBSetup({
    open: getCurrent,
    upgrade: (version, onUpgrade) => {
      const upgraded = open(version, onUpgrade).catch((cause) => {
        if (isVersionError(cause)) return open();
        throw cause;
      });
      current = upgraded;
      return upgraded;
    },
  });

  const attempt = <A>(run: () => Promise<A>) =>
    Effect.tryPromise({ try: run, catch: (cause) => cause });

  return {
    compare: (left, right) => resolveFactory(configuration).cmp(left, right),
    open: getCurrent,
    setup: (storeName, indexes) =>
      attempt(() => setup.setup(storeName, indexes)),
    readContract: (storeName) =>
      attempt(async () => {
        await setup.prepareContract();
        const database = await getCurrent();
        const record = (await requested(
          database
            .transaction(CONTRACT_STORE, 'readonly')
            .objectStore(CONTRACT_STORE)
            .get(storeName),
        )) as (IDBStoredContract & { readonly store: string }) | undefined;
        if (record === undefined) return undefined;
        return {
          mode: record.mode,
          hash: record.hash,
          snapshot: record.snapshot,
        };
      }),
    swapContract: (storeName, read, contract, { wipe }) =>
      attempt(async () => {
        const database = await getCurrent();
        const stores =
          wipe && database.objectStoreNames.contains(storeName)
            ? [CONTRACT_STORE, storeName]
            : [CONTRACT_STORE];
        const transaction = database.transaction(stores, 'readwrite');
        const contracts = transaction.objectStore(CONTRACT_STORE);
        let swapped = false;
        // Decided inside the transaction, so no other tab writes in between.
        const current = contracts.get(storeName);
        current.onsuccess = () => {
          const stored = current.result as IDBStoredContract | undefined;
          const unmoved =
            read === undefined
              ? stored === undefined
              : stored !== undefined &&
                stored.mode === read.mode &&
                stored.hash === read.hash;
          if (!unmoved) return;
          swapped = true;
          if (stores.length === 2) transaction.objectStore(storeName).clear();
          contracts.put({ store: storeName, ...contract });
        };
        await completed(transaction);
        return swapped;
      }),
  };
};

export const makeIDBDatabase = (
  configuration: IDBDatabaseConfig,
): IDBConnection => {
  if (configuration.indexedDB === undefined) {
    const existing = defaultConnections.get(configuration.databaseName);
    if (existing !== undefined) return existing;
    const connection = makeConnection(configuration);
    defaultConnections.set(configuration.databaseName, connection);
    return connection;
  }

  let factoryConnections = connections.get(configuration.indexedDB);
  if (factoryConnections === undefined) {
    factoryConnections = new Map();
    connections.set(configuration.indexedDB, factoryConnections);
  }
  const existing = factoryConnections.get(configuration.databaseName);
  if (existing !== undefined) return existing;

  const connection = makeConnection(configuration);
  factoryConnections.set(configuration.databaseName, connection);
  return connection;
};
