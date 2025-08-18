import type { ESchema } from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { DynamoTable, KeyFromIndex } from './table/index.js';
import type { IndexKeyMap } from './table/types.js';
import { Effect, Option } from 'effect';

type KeyArgs<Args extends DynamoTableIndex<DynamoTable<any, any, any>>> =
  Args extends { sk: string } ? [pkey: string, skey: string] : [pkey: string];

export class DynamoEntity<
  TESchema extends ESchema<any, any>,
  TDynamoTable extends DynamoTable<any, any, any>,
  TKeys extends IndexKeyMap<
    PrimaryIndex<TDynamoTable>,
    (...args: any[]) => string,
    (...args: any[]) => string
  >,
> {
  #schema: TESchema;
  #table: TDynamoTable;
  #keys: TKeys;

  constructor(schema: TESchema, table: TDynamoTable, keys: TKeys) {
    this.#schema = schema;
    this.#table = table;
    this.#keys = keys;
  }

  static make<
    S extends ESchema<any, any>,
    T extends DynamoTable<any, any, any>,
  >(schema: S, table: T) {
    return builder(schema, table);
  }
  key(
    ...args: KeyArgs<DynamoTableIndex<TDynamoTable>>
  ): PrimaryKey<TDynamoTable> {
    const [pkey, skey] = args;

    const result: any = {
      [this.#table.primary.pk]: pkey,
    };
    if (skey && this.#table.primary.sk) {
      result[this.#table.primary.sk] = skey;
    }

    return result;
  }

  get = (...args: KeyArgs<DynamoTableIndex<TDynamoTable>>) => {
    // eslint-disable-next-line ts/no-this-alias
    const th = this;

    return Effect.gen(function* () {
      const value = yield* th.#table.getItem(th.key(...args));

      return (yield* Effect.option(th.#schema.parse(value))) as Option.Option<
        Schema.Schema.Type<TESchema['schema']>
      >;
    });
  };

  put = (
    keys: KeyFromIndex<PrimaryIndex<TDynamoTable>>,
    item: Schema.Schema.Type<TESchema['schema']>,
  ) => {
    const table = this.#table;
    const schema = this.#schema;

    return Effect.gen(function* () {
      const data = schema.make(item);
      const d = {
        ...keys,
        ...(typeof data === 'object' ? data : null),
      };
      const value = yield* table.putItem(d);

      return value;
    });
  };

  update = (
    key: PrimaryKey<TDynamoTable>,
    item: Partial<Schema.Schema.Type<TESchema['schema']>>,
  ) => {
    // eslint-disable-next-line ts/no-this-alias
    const th = this;

    return Effect.gen(function* () {
      const value = yield* th.#table.updateItem(
        key,
        th.#schema.makePartial(item),
      );

      return value;
    });
  };

  query = (...params: Parameters<TDynamoTable['query']>) => {
    // eslint-disable-next-line ts/no-this-alias
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.query(params[0], params[1]);

      const parsed = yield* Effect.all(
        result.Items.map((v: any) => Effect.option(th.#schema.parse(v))),
      );

      return {
        Items: parsed
          .filter(Option.isSome)
          .map((v) => v.value) as Schema.Schema.Type<TESchema['schema']>[],
      };
    });
  };

  scan = () => {
    // eslint-disable-next-line ts/no-this-alias
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.scan();

      const parsed = yield* Effect.all(
        result.Items.map((v: any) => Effect.option(th.#schema.parse(v))),
      );

      return {
        Items: parsed
          .filter(Option.isSome)
          .map((v) => v.value) as Schema.Schema.Type<TESchema['schema']>[],
      };
    });
  };
}

type DynamoTableIndex<Table extends DynamoTable<any, any, any>> =
  Table extends DynamoTable<infer Index> ? Index : never;

type PrimaryKey<Table extends DynamoTable<any, any, any>> =
  Table extends DynamoTable<infer Primary> ? KeyFromIndex<Primary> : never;
export type PrimaryIndex<Table extends DynamoTable<any, any, any>> =
  Table extends DynamoTable<infer Index> ? Index : never;

function builder<
  TESchema extends ESchema<any, any>,
  TDynamoTable extends DynamoTable<any, any, any>,
>(schema: TESchema, table: TDynamoTable) {
  return {
    primary<
      Pk extends (...args: any[]) => string,
      Sk extends (...args: any[]) => string,
    >(value: IndexKeyMap<PrimaryIndex<TDynamoTable>, Pk, Sk>) {
      return {
        build() {
          return new DynamoEntity(schema, table, {
            pk: value.pk,
            sk: 'sk' in value ? value.sk : undefined,
          } as IndexKeyMap<PrimaryIndex<TDynamoTable>, Pk, Sk>);
        },
      };
    },
  };
}
