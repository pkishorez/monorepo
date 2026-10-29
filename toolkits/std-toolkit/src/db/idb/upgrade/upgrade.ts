interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

interface UpgradePlan {
  readonly storeName: string;
  readonly createStore: boolean;
  /** Indexes to create, replacing one of the same name. */
  readonly indexes: readonly IDBIndexDefinition[];
  /** Indexes the topology no longer declares. */
  readonly removed: readonly string[];
}

const ENTITY_INDEX: IDBIndexDefinition = { name: '_entity', keyPath: '_e' };

/**
 * What an upgrade must change so the store exists, and with `exact` so its
 * indexes are exactly the declared ones; null when nothing. Only a missing
 * store is created without `exact`, since it holds nothing to protect.
 */
export const inspectUpgrade = (
  database: IDBDatabase,
  storeName: string,
  indexes: readonly IDBIndexDefinition[],
  exact: boolean,
): UpgradePlan | null => {
  if (!database.objectStoreNames.contains(storeName))
    return { storeName, createStore: true, indexes, removed: [] };

  const store = database
    .transaction(storeName, 'readonly')
    .objectStore(storeName);
  if (JSON.stringify(store.keyPath) !== JSON.stringify(['pk', 'sk']))
    throw new Error(
      `IndexedDB Store "${storeName}" has an incompatible key path`,
    );
  if (!exact) return null;
  const expected = [ENTITY_INDEX, ...indexes];
  const expectedNames = new Set(expected.map(({ name }) => name));
  const removed = [...store.indexNames].filter(
    (name) => !expectedNames.has(name),
  );
  const changedIndexes = expected.filter((index) => {
    if (!store.indexNames.contains(index.name)) return true;
    const existing = store.index(index.name);
    return (
      existing.unique ||
      existing.multiEntry ||
      JSON.stringify(existing.keyPath) !== JSON.stringify(index.keyPath)
    );
  });
  return changedIndexes.length === 0 && removed.length === 0
    ? null
    : { storeName, createStore: false, indexes: changedIndexes, removed };
};

// Runs inside the versionchange transaction, which closes as soon as it
// waits on anything else: every step here is synchronous.
export const upgradeDatabase = (
  database: IDBDatabase,
  transaction: IDBTransaction,
  plan: UpgradePlan,
) => {
  const store = plan.createStore
    ? database.createObjectStore(plan.storeName, { keyPath: ['pk', 'sk'] })
    : transaction.objectStore(plan.storeName);
  if (plan.createStore)
    store.createIndex(ENTITY_INDEX.name, ENTITY_INDEX.keyPath);
  for (const name of plan.removed) store.deleteIndex(name);
  for (const index of plan.indexes) {
    if (store.indexNames.contains(index.name)) store.deleteIndex(index.name);
    store.createIndex(
      index.name,
      typeof index.keyPath === 'string' ? index.keyPath : [...index.keyPath],
    );
  }
};
