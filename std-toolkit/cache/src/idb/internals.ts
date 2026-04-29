import type { IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { EntityType } from '@std-toolkit/core';

export const DEFAULT_DB_NAME = 'std-toolkit-cache';
export const STORE_NAME = 'items';
export const UPDATED_INDEX = 'by-updated';
export const DB_VERSION = 2;

export type StoredItem = {
  key: [string, string];
  updatedKey: [string, string];
  value: unknown;
  meta: EntityType<unknown>['meta'];
};

export const ConnectionPool = {
  connections: new Map<string, IDBPDatabase>(),
  opened: new Set<string>(),

  async acquire(dbName: string, version?: number): Promise<IDBPDatabase> {
    const cached = this.connections.get(dbName);
    if (cached) {
      return cached;
    }

    const db = await openDB(dbName, version ?? DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion > 0 && database.objectStoreNames.contains(STORE_NAME)) {
          database.deleteObjectStore(STORE_NAME);
        }
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'key',
        });
        store.createIndex(UPDATED_INDEX, 'updatedKey');
      },
    });

    this.connections.set(dbName, db);
    this.opened.add(dbName);
    return db;
  },

  get(dbName: string): IDBPDatabase | undefined {
    return this.connections.get(dbName);
  },

  async destroy(name: string): Promise<void> {
    const cached = this.connections.get(name);
    if (cached) {
      cached.close();
      this.connections.delete(name);
    }
    this.opened.delete(name);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async destroyAll(): Promise<void> {
    for (const name of this.opened) {
      const cached = this.connections.get(name);
      if (cached) {
        cached.close();
        this.connections.delete(name);
      }
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    this.opened.clear();
  },
};
