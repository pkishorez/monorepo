import type { IDBPDatabase } from 'idb';
import { openDB } from 'idb';

export const ENTRY_STORE = 'entries';
export const METADATA_STORE = 'metadata';
export const GROUP_INDEX = 'by-group';
export const DATA_VERSION_KEY = 'data-version';
export const DB_SCHEMA_VERSION = 1;

export type DataVersion = string | number;

export type StoredEntry = {
  group: string;
  key: string;
  value: unknown;
};

const connections = new Map<string, IDBPDatabase>();

export const acquireDatabase = async (
  name: string,
  dataVersion: DataVersion,
): Promise<IDBPDatabase> => {
  let db = connections.get(name);
  if (!db) {
    db = await openDB(name, DB_SCHEMA_VERSION, {
      upgrade(database) {
        const entries = database.createObjectStore(ENTRY_STORE, {
          keyPath: ['group', 'key'],
        });
        entries.createIndex(GROUP_INDEX, 'group');
        database.createObjectStore(METADATA_STORE);
      },
    });
    connections.set(name, db);
  }

  const tx = db.transaction([ENTRY_STORE, METADATA_STORE], 'readwrite');
  const storedVersion = await tx
    .objectStore(METADATA_STORE)
    .get(DATA_VERSION_KEY);
  if (storedVersion !== dataVersion) {
    await tx.objectStore(ENTRY_STORE).clear();
    await tx.objectStore(METADATA_STORE).put(dataVersion, DATA_VERSION_KEY);
  }
  await tx.done;

  return db;
};
