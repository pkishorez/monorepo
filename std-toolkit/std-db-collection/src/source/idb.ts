import { ESchema } from '@std-toolkit/eschema';
import { Source } from './source.js';
import { IDBStore, IDBEntity } from '@std-toolkit/idb';
import { Schema } from 'effect';

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    key: Schema.String,
    value: Schema.Any,
  }),
).build();

export class IDbSource<T> extends Source<T> {
  entity: IDBEntity<string, typeof eschema, 'key', IDBStore>;

  constructor(name: string, store: IDBStore) {
    super();
    this.entity = IDBEntity.make(name).eschema(eschema).id('key').build(store);
  }
  get = async (key: string) => {
    const result = await this.entity.get(key);
    return result?.value?.value as T | undefined;
  };

  set = async (key: string, value: T) => {
    this.entity.put({ key, value });
  };

  getAll = async () => {
    return (await this.entity.query()).map((v) => v.value) as T[];
  };
}
