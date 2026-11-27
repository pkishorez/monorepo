export interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

/** A version change of the database, made only while it is needed. */
export interface IDBUpgrade {
  /**
   * Whether the open database still needs it. It may throw, changing
   * nothing, when the database cannot take it.
   */
  readonly needed: (database: IDBDatabase) => boolean;
  /** Makes it, inside the version change; does nothing if it is made already. */
  readonly apply: (database: IDBDatabase, transaction: IDBTransaction) => void;
}

const ENTITY_INDEX: IDBIndexDefinition = { name: '_entity', keyPath: '_e' };

const refuseReserved = (indexes: readonly IDBIndexDefinition[]) => {
  if (indexes.some(({ name }) => name === ENTITY_INDEX.name))
    throw new Error('IndexedDB index slot name "_entity" is reserved');
};

const sameKeyPath = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * The indexes an existing store lacks or holds in another form. Throws when
 * the store can never take the table: another key path, or a unique index
 * the table does not declare.
 */
const changedIndexes = (
  store: IDBObjectStore,
  storeName: string,
  indexes: readonly IDBIndexDefinition[],
): readonly IDBIndexDefinition[] => {
  if (!sameKeyPath(store.keyPath, ['pk', 'sk']))
    throw new Error(
      `IndexedDB Store "${storeName}" has an incompatible key path`,
    );
  const expected = [ENTITY_INDEX, ...indexes];
  const expectedNames = new Set(expected.map(({ name }) => name));
  for (const name of store.indexNames) {
    if (!expectedNames.has(name) && store.index(name).unique)
      throw new Error(
        `IndexedDB Store "${storeName}" has an undeclared unique index "${name}"`,
      );
  }
  return expected.filter((index) => {
    if (!store.indexNames.contains(index.name)) return true;
    const existing = store.index(index.name);
    return (
      existing.unique ||
      existing.multiEntry ||
      !sameKeyPath(existing.keyPath, index.keyPath)
    );
  });
};

const readStore = (database: IDBDatabase, storeName: string) =>
  database.transaction(storeName, 'readonly').objectStore(storeName);

const createIndexes = (
  store: IDBObjectStore,
  indexes: readonly IDBIndexDefinition[],
) => {
  for (const index of indexes) {
    if (store.indexNames.contains(index.name)) store.deleteIndex(index.name);
    store.createIndex(
      index.name,
      typeof index.keyPath === 'string' ? index.keyPath : [...index.keyPath],
    );
  }
};

const createStore = (
  database: IDBDatabase,
  storeName: string,
  indexes: readonly IDBIndexDefinition[],
) =>
  createIndexes(
    database.createObjectStore(storeName, { keyPath: ['pk', 'sk'] }),
    [ENTITY_INDEX, ...indexes],
  );

/**
 * Creates the store, with its indexes, when it is missing. An existing store
 * is only checked: its indexes are left for `reconcileStore`.
 */
export const ensureStore = (
  storeName: string,
  indexes: readonly IDBIndexDefinition[],
): IDBUpgrade => ({
  needed: (database) => {
    refuseReserved(indexes);
    if (!database.objectStoreNames.contains(storeName)) return true;
    changedIndexes(readStore(database, storeName), storeName, indexes);
    return false;
  },
  apply: (database) => {
    if (!database.objectStoreNames.contains(storeName))
      createStore(database, storeName, indexes);
  },
});

/** Creates the store when missing, then adds or replaces the indexes it lacks. */
export const reconcileStore = (
  storeName: string,
  indexes: readonly IDBIndexDefinition[],
): IDBUpgrade => ({
  needed: (database) => {
    refuseReserved(indexes);
    return (
      !database.objectStoreNames.contains(storeName) ||
      changedIndexes(readStore(database, storeName), storeName, indexes)
        .length > 0
    );
  },
  apply: (database, transaction) => {
    if (!database.objectStoreNames.contains(storeName))
      return createStore(database, storeName, indexes);
    const store = transaction.objectStore(storeName);
    createIndexes(store, changedIndexes(store, storeName, indexes));
  },
});
