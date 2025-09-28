import { ESchema } from '@monorepo/eschema';
import { IDBStore } from './store.js';

export class IDBEntityUnit<
  TName extends string,
  TSchema extends ESchema<any>,
  TStore extends IDBStore,
> {
  #store: TStore;
  #name: TName;
  #eschema: TSchema;

  private constructor(name: TName, eschema: TSchema, store: TStore) {
    this.#name = name;
    this.#eschema = eschema;
    this.#store = store;
  }

  async get() {
    const value = await this.#store.getItem({
      entity: this.#name,
      id: `UNIT_${this.#name}`,
    });

    console.log('VALUE: ', value);

    return this.#eschema.parseSync(value.value).value;
  }

  put(item: TSchema['Type']) {
    const value = this.#eschema.make(item);

    return this.#store.put({
      entity: this.#name,
      id: `UNIT_${this.#name}`,
      value,
    });
  }

  static make<TName extends string>(name: TName) {
    return {
      eschema: <TESchema extends ESchema<any>>(eschema: TESchema) => ({
        build: <TStore extends IDBStore>(store: TStore) => {
          return new IDBEntityUnit(name, eschema, store);
        },
      }),
    };
  }
}
