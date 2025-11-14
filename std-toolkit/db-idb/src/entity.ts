import { ESchema } from '@monorepo/eschema';
import { IDBStore } from './store.js';

export class IDBEntity<
  TName extends string,
  TSchema extends ESchema<any>,
  TKey extends keyof TSchema['Type'],
  TStore extends IDBStore,
> {
  static make<TName extends string>(name: TName) {
    return {
      eschema: <TESchema extends ESchema<any>>(eschema: TESchema) => ({
        id: <TKey extends keyof TESchema['Type']>(key: TKey) => ({
          build: <TStore extends IDBStore>(store: TStore) => {
            return new IDBEntity(name, eschema, key, store);
          },
        }),
      }),
    };
  }

  #store: TStore;
  #name: TName;
  #eschema: TSchema;
  #key: TKey;

  private constructor(name: TName, eschema: TSchema, key: TKey, store: TStore) {
    this.#name = name;
    this.#eschema = eschema;
    this.#key = key;
    this.#store = store;
  }

  async query() {
    const value = await this.#store.getAll(
      IDBKeyRange.bound([this.#name], [this.#name, '\uffffff']),
    );

    return value.map(
      (v) => this.#eschema.parse(v.value).value,
    ) as TSchema['Type'][];
  }

  get(id: string) {
    return this.#store.getItem({ entity: this.#name, id });
  }

  put(item: TSchema['Type']) {
    const value = this.#eschema.make(item);

    return this.#store.put({
      entity: this.#name,
      id: value[this.#key] as string,
      value,
    });
  }
}
