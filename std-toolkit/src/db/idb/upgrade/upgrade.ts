interface IDBIndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly [string, string];
}

interface UpgradePlan {
  readonly storeName: string;
  readonly createStore: boolean;
  readonly indexes: readonly IDBIndexDefinition[];
}

export const inspectUpgrade = (
  database: IDBDatabase,
  storeName: string,
  indexes: readonly IDBIndexDefinition[],
): UpgradePlan | null => {
  if (!database.objectStoreNames.contains(storeName))
    return { storeName, createStore: true, indexes };

  const store = database
    .transaction(storeName, 'readonly')
    .objectStore(storeName);
  if (JSON.stringify(store.keyPath) !== JSON.stringify(['pk', 'sk']))
    throw new Error(
      `IndexedDB Store "${storeName}" has an incompatible key path`,
    );
  const expected = [{ name: '_entity', keyPath: '_e' }, ...indexes];
  const expectedNames = new Set(expected.map(({ name }) => name));
  for (const name of store.indexNames) {
    if (!expectedNames.has(name) && store.index(name).unique)
      throw new Error(
        `IndexedDB Store "${storeName}" has an undeclared unique index "${name}"`,
      );
  }
  const changedIndexes = expected.filter((index) => {
    if (!store.indexNames.contains(index.name)) return true;
    const existing = store.index(index.name);
    return (
      existing.unique ||
      existing.multiEntry ||
      JSON.stringify(existing.keyPath) !== JSON.stringify(index.keyPath)
    );
  });
  return changedIndexes.length === 0
    ? null
    : { storeName, createStore: false, indexes: changedIndexes };
};

export const upgradeDatabase = (
  database: IDBDatabase,
  transaction: IDBTransaction,
  plan: UpgradePlan,
) => {
  const store = plan.createStore
    ? database.createObjectStore(plan.storeName, { keyPath: ['pk', 'sk'] })
    : transaction.objectStore(plan.storeName);
  if (plan.createStore) store.createIndex('_entity', '_e');
  for (const index of plan.indexes) {
    if (store.indexNames.contains(index.name)) store.deleteIndex(index.name);
    store.createIndex(
      index.name,
      typeof index.keyPath === 'string' ? index.keyPath : [...index.keyPath],
    );
  }
};
