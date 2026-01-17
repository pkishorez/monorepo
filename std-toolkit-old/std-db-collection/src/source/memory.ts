import { Source } from './source.js';

export class MemorySource<T> extends Source<T> {
  #store: Map<string, T> = new Map();

  get = async (key: string) => {
    return this.#store.get(key);
  };
  set = async (key: string, value: T) => {
    this.#store.set(key, value);
  };
  getAll = async () => {
    return Array.from(this.#store.values());
  };
}
