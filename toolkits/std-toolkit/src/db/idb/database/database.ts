import { Effect } from 'effect';
import { makeIDBSetup } from '../upgrade/index.js';

export interface IDBDatabaseConfig {
  readonly databaseName: string;
  readonly indexedDB?: IDBFactory;
}

export interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

export interface IDBConnection {
  readonly compare: (left: IDBValidKey, right: IDBValidKey) => number;
  readonly open: () => Promise<IDBDatabase>;
  readonly setup: (
    storeName: string,
    indexes: readonly IDBIndexDefinition[],
  ) => Effect.Effect<void, unknown>;
}

const connections = new WeakMap<IDBFactory, Map<string, IDBConnection>>();
const defaultConnections = new Map<string, IDBConnection>();

const resolveFactory = (configuration: IDBDatabaseConfig) => {
  const factory = configuration.indexedDB ?? globalThis.indexedDB;
  if (factory === undefined)
    throw new Error('IndexedDB is not available in this environment');
  return factory;
};

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
    request.onblocked = () =>
      fail(new Error(`IndexedDB database "${name}" is blocked`));
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

  return {
    compare: (left, right) => resolveFactory(configuration).cmp(left, right),
    open: getCurrent,
    setup: (storeName, indexes) =>
      Effect.tryPromise({
        try: () => setup(storeName, indexes),
        catch: (cause) => cause,
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
