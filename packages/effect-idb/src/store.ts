import type { IDBPDatabase } from 'idb';
import { openDB } from 'idb';

const storeName = 'single-store';
type TItem<Value = any> = {
  entity: string;
  id: string;
  value: Value;
};

export class IDBStore {
  #db: IDBPDatabase;
  private constructor(db: IDBPDatabase) {
    this.#db = db;

    (window as any).idb = db;
  }

  get db() {
    return this.#db;
  }

  async getAll(
    query?: IDBKeyRange | IDBValidKey,
    count?: number,
  ): Promise<TItem<any>[]> {
    return this.#db.getAll(storeName, query, count);
  }

  async put<Value>(value: TItem<Value>) {
    this.#db.put(storeName, value);
  }

  async update<Value>(value: TItem<Value>) {
    const existing = await this.#db.get(storeName, [value.entity, value.id]);

    const update = { ...existing, ...value };
    await this.#db.put(storeName, update);

    return update;
  }

  async purge() {
    return this.#db.clear(storeName);
  }

  async getItem({ entity, id }: Omit<TItem, 'value'>): Promise<TItem> {
    return this.#db.get(
      storeName,
      [entity, id].filter((v) => v != undefined),
    );
  }

  static async make(database: string) {
    try {
      const db = await openDB(database, 1, {
        upgrade(database) {
          database.createObjectStore(storeName, {
            keyPath: ['entity', 'id'],
          });
        },
      });
      return new IDBStore(db);
    } catch {
      return null as any as IDBStore;
    }
  }
}
