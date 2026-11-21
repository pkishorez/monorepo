import type { SavedSnapshot } from '@kestack/kabuki/types';

/*
 * Where the Fake World keeps each Fake's Snapshot, so a reload keeps the
 * world. A Snapshot is kept saved, as `Snapshot.save` gives it: plain JSON,
 * every value as its Actor's Schemas encode it.
 *
 * 1. Saved      what the Fake World asks of any store: load and save a
 *               Snapshot by the Fake's name.
 * 2. IndexedDB  the store a browser tab uses: one database, one object
 *               store, a Snapshot per Fake. IndexedDB, not localStorage: a
 *               File System's Snapshot is its whole disk, larger than
 *               localStorage holds, and saving it is not done on the page's
 *               own thread. Start fresh deletes it with every other one.
 */

// 1. Saved
/** Where each Fake's Snapshot is kept, by the Fake's name. */
export interface SavedFakes {
  /** The Snapshot saved last under a name; none if nothing was. */
  load(
    name: string,
  ): SavedSnapshot | undefined | Promise<SavedSnapshot | undefined>;
  save(name: string, snapshot: SavedSnapshot): void | Promise<void>;
}

// 2. IndexedDB
/** The database the Fake World keeps its Snapshots in, by default. */
export const DATABASE = '@kestack/devtools-kabuki/fake';
const STORE = 'snapshots';

const requested = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Each Fake's Snapshot in the tab's IndexedDB, in the database named. */
export const indexedDb = (database: string = DATABASE): SavedFakes => {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () =>
        void request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const db = request.result;
        // Start fresh in another tab deletes it: let go at once.
        db.onversionchange = () => {
          db.close();
          opened = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }));
  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    load: async (name) =>
      ((await requested((await store('readonly')).get(name))) as
        | SavedSnapshot
        | undefined) ?? undefined,
    save: async (name, snapshot) =>
      void (await requested((await store('readwrite')).put(snapshot, name))),
  };
};
