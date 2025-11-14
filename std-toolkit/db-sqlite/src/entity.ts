import { EmptyESchemaWithName } from '@monorepo/eschema/eschema.js';
import {
  IndexKeyDerivation,
  IndexDerivation,
  IndexDerivationValue,
  EmptyIndexDerivation,
  IndexKeyDerivationValue,
} from '@std-toolkit/core/types.js';
import { Effect } from 'effect';
import {
  deriveIndexKeyValue,
  fromDiscriminatedGeneric,
  toDiscriminatedGeneric,
} from '@std-toolkit/core/utils.js';
import { metaSchema } from '@std-toolkit/core/schema.js';
import { Simplify } from 'type-fest';
import { SqliteTable } from './table.js';
import {
  NoItemToUpdate,
  ItemAlreadyExist,
  ItemNotFound,
  DatabaseError,
} from '@std-toolkit/core/errors.js';
import { SortKeyparameter } from './types.js';
import { isNotNullable } from 'effect/Predicate';
import { keyvalues, sql } from './utils.js';

export class SqliteEntity<
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { indexName: keyof TTable['indexMap'] }
  >,
  TTable extends SqliteTable<any>,
  TSchema extends EmptyESchemaWithName,
  TPrimaryDerivation extends EmptyIndexDerivation,
> {
  static make<TT extends SqliteTable<any>>(table: TT) {
    return {
      eschema<TS extends EmptyESchemaWithName>(eschema: TS) {
        return {
          primary<
            TPkKeys extends keyof TS['Type'],
            TSkKeys extends keyof TS['Type'],
          >(
            primaryDerivation: IndexDerivation<
              IndexKeyDerivation<TS['Type'], TPkKeys>,
              IndexKeyDerivation<TS['Type'], TSkKeys>
            >,
          ) {
            return new EntityIndexDerivations(
              table,
              eschema,
              primaryDerivation,
            );
          },
        };
      },
    };
  }

  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: TPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;
  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: TPrimaryDerivation,
    secondaryDerivations: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = secondaryDerivations;
  }

  get(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    options?: { debug?: boolean },
  ) {
    return Effect.gen(this, function* () {
      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);

      const r = keyvalues({
        pk,
        sk,
      });
      const query = sql`SELECT * FROM ${this.#table.tableName} where pk = ? AND sk = ?`;
      if (options?.debug) {
        console.log('GET::: ', query, r.values);
      }

      const data = yield* Effect.try({
        try: () => this.#table.sql.exec(query, ...r.values).one(),
        catch: (err) => {
          const message = (err as any).message;

          return new ItemNotFound({ message });
        },
      });
      if (!data?.data) return yield* new ItemNotFound();

      return this.#eschema.parse(JSON.parse(data.data as string)).value;
    });
  }

  insert(
    value: TSchema['Type'],
    options?: {
      debug?: boolean;
    },
  ) {
    return Effect.gen(this, function* () {
      value = this.#eschema.make(value);
      const primaryIndex = this.#derivePrimaryIndex(value);
      const indexMap = this.#deriveSecondaryIndexes(value);

      const r = keyvalues({
        pk: primaryIndex.pk,
        sk: primaryIndex.sk,
        entity: this.#eschema.name,
        __v: this.#eschema.latest.version,
        __d: false,
        __i: 0,
        data: JSON.stringify(value),
        ...indexMap,
      });
      const query = sql`INSERT into ${this.#table.tableName} (${r.keys}) values( ${r.placeholders} )`;

      if (options?.debug) console.log({ query, values: r.values });

      return yield* Effect.try({
        try: () => {
          this.#table.sql.exec(query, ...r.values);
          return { item: value };
        },
        catch(err) {
          const message = (err as Error)?.message;
          if (message.startsWith('UNIQUE constraint failed:')) {
            return new ItemAlreadyExist({ message });
          }
          return new DatabaseError({ message });
        },
      });
    });
  }

  update(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    value: Partial<TSchema['Type']>,
    options?: {
      debug?: boolean;
      meta?: typeof metaSchema.Type;
    },
  ) {
    return Effect.gen(this, function* () {
      if (
        Object.keys(value).some(
          (key) =>
            (this.#primaryDerivation.pk.deps.includes(key) ||
              this.#primaryDerivation.sk.deps.includes(key)) &&
            value[key] !== keyValue[key],
        )
      ) {
        return yield* new DatabaseError({
          message: 'You cannot update key that is already part of primary key.',
        });
      }
      const existingValue = yield* this.get(keyValue, options);

      if (!existingValue) {
        return yield* new NoItemToUpdate();
      }

      value = {
        ...existingValue,
        ...(this.#eschema.makePartial(value) as any),
      };

      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);
      const indexMap = this.#deriveSecondaryIndexes(value);

      const setr = keyvalues({
        data: JSON.stringify(value),
        ...indexMap,
      });

      const query = sql`UPDATE ${this.#table.tableName} SET ${setr.setKeys} WHERE pk = ? AND sk = ?`;
      const queryValues = [...setr.values, pk, sk];
      if (options?.debug) {
        console.log({ query, queryValues });
      }

      return yield* Effect.try({
        try: () => {
          this.#table.sql.exec(query, ...queryValues);
          return { item: value };
        },
        catch(err) {
          return new DatabaseError({ message: (err as Error)?.message });
        },
      });
    });
  }

  query(
    {
      pk,
      sk,
    }: {
      pk: Simplify<IndexKeyDerivationValue<TPrimaryDerivation['pk']>>;
      sk: SortKeyparameter<IndexKeyDerivationValue<TPrimaryDerivation['sk']>>;
    },

    options?: {
      debug?: boolean;
    },
  ) {
    const testPk = deriveIndexKeyValue(this.#primaryDerivation['pk'], pk);
    const testSk = this.#calculateSk(this.#primaryDerivation, sk as any);

    const { skQuery, skValue } = (() => {
      const dsk = toDiscriminatedGeneric(testSk);
      switch (dsk.type) {
        case '<':
        case '<=':
        case '>':
        case '>=':
          return { skQuery: `sk ${dsk.type} ?`, skValue: dsk.value };
      }
    })();
    const query = sql`SELECT * FROM ${this.#table.tableName} WHERE pk = ? AND ${skQuery}`;
    const queryValues = [testPk, skValue];

    if (options?.debug) {
      console.log({ query, queryValues });
    }

    return this.#table.sql.exec(query, ...queryValues);
  }

  index<Alias extends keyof TSecondaryDerivationMap>(
    alias: Alias,
    options?: {
      debug?: boolean;
    },
  ) {
    return {
      query: ({
        pk,
        sk,
      }: Record<
        'pk',
        Simplify<IndexKeyDerivationValue<TSecondaryDerivationMap[Alias]['pk']>>
      > &
        Record<
          'sk',
          SortKeyparameter<IndexKeyDerivationValue<
            TSecondaryDerivationMap[Alias]['sk']
          > | null>
        >) => {
        const indexDerivation = this.#secondaryDerivations[alias];
        const indexDef = this.#table.indexMap[indexDerivation.indexName];
        const testPk = deriveIndexKeyValue(indexDerivation.pk, pk);
        const testSk = this.#calculateSk(indexDerivation, sk as any);

        const { skQuery, skValue } = (() => {
          const dsk = toDiscriminatedGeneric(testSk);
          if (dsk.value === null || dsk.value === undefined) {
            return { skQuery: `1=1`, skValue: null };
          }
          switch (dsk.type) {
            case '<':
            case '<=':
            case '>':
            case '>=':
              return {
                skQuery: `${indexDef.sk} ${dsk.type} ?`,
                skValue: dsk.value,
              };
          }
        })();
        const query = sql`SELECT * from ${this.#table.tableName} where ${indexDef.pk} = ? AND ${skQuery}`;
        const queryValues = [testPk, skValue].filter(isNotNullable);

        if (options?.debug) {
          console.log({ query, queryValues });
        }

        return Effect.try({
          try: () => {
            const values = this.#table.sql
              .exec(query, ...queryValues)
              .toArray();
            return {
              items: values.map((v) =>
                this.#eschema.parse(JSON.parse(v.data as any)),
              ),
            };
          },
          catch(error) {
            return new DatabaseError({ message: (error as Error)?.message });
          },
        });
      },
    };
  }

  #calculateSk(derivation: EmptyIndexDerivation, sk: SortKeyparameter) {
    const realSk = toDiscriminatedGeneric(sk);
    switch (realSk.type) {
      case '<':
      case '<=':
      case '>':
      case '>=':
        if (realSk.value == null) break;
        realSk.value = deriveIndexKeyValue(derivation['sk'], realSk.value);
        break;
    }
    return fromDiscriminatedGeneric(realSk) as SortKeyparameter;
  }

  #derivePrimaryIndex(value: any) {
    return {
      pk: deriveIndexKeyValue(this.#primaryDerivation['pk'], value),
      sk: deriveIndexKeyValue(this.#primaryDerivation['sk'], value),
    };
  }

  #deriveSecondaryIndexes(value: any) {
    const indexMap: Record<string, string> = {};
    Object.entries(this.#secondaryDerivations).forEach(([, derivation]) => {
      const si = this.#table.indexMap[derivation.indexName];
      if (
        derivation.pk.deps.every((key) => typeof value[key] !== 'undefined')
      ) {
        indexMap[si.pk] = derivation.pk.derive(value).join('#');
      }
      if (
        derivation.sk.deps.every((key) => typeof value[key] !== 'undefined')
      ) {
        indexMap[si.sk] = derivation.sk.derive(value).join('#');
      }
    });

    return indexMap;
  }
}

class EntityIndexDerivations<
  TTable extends SqliteTable<any>,
  TSchema extends EmptyESchemaWithName,
  TPrimaryDerivation extends IndexDerivation<any, any>,
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { indexName: keyof TTable['indexMap'] }
  > = {},
> {
  #table: TTable;
  #eschema: TSchema;
  #secondaryDerivations: TSecondaryDerivationMap;
  #primaryDerivation: TPrimaryDerivation;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: TPrimaryDerivation,
    definitions?: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions ?? ({} as TSecondaryDerivationMap);
  }

  index<
    Alias extends string,
    IndexName extends keyof TTable['indexMap'],
    TPkKeys extends keyof TSchema['Type'],
    TSkKeys extends keyof TSchema['Type'],
  >(
    indexName: IndexName,
    alias: Alias,
    indexDerivation: {
      pk: IndexKeyDerivation<TSchema['Type'], TPkKeys>;
      sk: IndexKeyDerivation<TSchema['Type'], TSkKeys>;
    },
  ) {
    return new EntityIndexDerivations(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      {
        ...this.#secondaryDerivations,
        [alias as string]: {
          ...indexDerivation,
          indexName,
        },
      },
    ) as EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryDerivation,
      TSecondaryDerivationMap &
        Record<
          Alias,
          IndexDerivation<
            IndexKeyDerivation<TSchema['Type'], TPkKeys>,
            IndexKeyDerivation<TSchema['Type'], TSkKeys>
          > & { indexName: keyof TTable['indexMap'] }
        >
    >;
  }

  build() {
    return new SqliteEntity(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      this.#secondaryDerivations,
    );
  }
}
