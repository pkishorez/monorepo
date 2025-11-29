import {
  IndexKeyDerivation,
  IndexDerivation,
  IndexDerivationValue,
  EmptyIndexDerivation,
  IndexKeyDerivationValue,
} from '@std-toolkit/core/types.js';
import { BroadcastService, BroadcastTo } from '@std-toolkit/core/broadcast.js';
import { ConnectionService } from '@std-toolkit/core/connection.js';
import { Effect, Option } from 'effect';
import {
  deriveIndexKeyValue,
  fromDiscriminatedGeneric,
  toDiscriminatedGeneric,
} from '@std-toolkit/core/utils.js';
import {
  broadcastSchema,
  BroadcastSchemaType,
  DerivableMeta,
  metaSchema,
} from '@std-toolkit/core/schema.js';
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
import { EmptyStdESchema } from '@std-toolkit/eschema/eschema-std.js';

export class SqliteEntity<
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { indexName: keyof TTable['indexMap'] }
  >,
  TTable extends SqliteTable<any>,
  TSchema extends EmptyStdESchema,
  TPrimaryDerivation extends EmptyIndexDerivation,
> {
  static make<TT extends SqliteTable<any>>(table: TT) {
    return {
      eschema<TS extends EmptyStdESchema>(eschema: TS) {
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

  get name() {
    return this.#eschema.name;
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

      return this.#parseData(data);
    });
  }

  insert(
    value: TSchema['Type'],
    options?: {
      broadcast?: BroadcastTo['to'];
      debug?: boolean;
    },
  ) {
    return Effect.gen(this, function* () {
      const meta = {
        _e: this.#eschema.name,
        _v: this.#eschema.latest.version,
        // HACK: sqlite do not have proper boolean type.
        _d: 0 as any as false,
        _i: 0,
        _u: new Date().toISOString(),
      } satisfies typeof metaSchema.Type;
      value = this.#eschema.make(value);
      const primaryIndex = this.#derivePrimaryIndex(value);
      const indexMap = this.#deriveSecondaryIndexes(value);

      const r = keyvalues({
        pk: primaryIndex.pk,
        sk: primaryIndex.sk,
        data: JSON.stringify(value),
        ...meta,
        ...indexMap,
      });
      const query = sql`INSERT into ${this.#table.tableName} (${r.keys}) values( ${r.placeholders} )`;

      if (options?.debug) console.log({ query, values: r.values });

      yield* Effect.try({
        try: () => {
          this.#table.sql.exec(query, ...r.values);
        },
        catch(err) {
          const message = (err as Error)?.message;
          if (message.startsWith('UNIQUE constraint failed:')) {
            return new ItemAlreadyExist({ message });
          }
          return new DatabaseError({ message });
        },
      });
      return yield* this.#broadcastResponse(
        { value, meta },
        options?.broadcast,
      );
    });
  }

  update(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    value: Partial<TSchema['Type']>,
    options?: {
      broadcast?: BroadcastTo['to'];
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
        ...existingValue.value,
        ...(this.#eschema.makePartial(value) as any),
      };

      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);
      const indexMap = this.#deriveSecondaryIndexes({
        ...value,
        _u: new Date().toISOString(),
      });

      const setr = keyvalues({
        data: JSON.stringify(value),
        ...indexMap,
      });

      const query = sql`UPDATE ${this.#table.tableName} SET ${setr.setKeys} WHERE pk = ? AND sk = ?`;
      const queryValues = [...setr.values, pk, sk];
      if (options?.debug) {
        console.log({ query, queryValues });
      }

      yield* Effect.try({
        try: () => {
          this.#table.sql.exec(query, ...queryValues);
        },
        catch(err) {
          return new DatabaseError({ message: (err as Error)?.message });
        },
      });

      return yield* this.#broadcastResponse(
        yield* this.get(keyValue, options),
        options?.broadcast,
      );
    });
  }

  delete(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    options?: {
      broadcast?: BroadcastTo['to'];
      debug?: boolean;
    },
  ) {
    return Effect.gen(this, function* () {
      const existingValue = yield* this.get(keyValue, options);

      if (!existingValue) {
        return yield* new NoItemToUpdate();
      }

      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);

      const query = sql`UPDATE ${this.#table.tableName} SET _d=? WHERE pk = ? AND sk = ?`;
      const queryValues = [1, pk, sk];
      if (options?.debug) {
        console.log({ query, queryValues });
      }

      yield* Effect.try({
        try: () => {
          this.#table.sql.exec(query, ...queryValues);
        },
        catch(err) {
          return new DatabaseError({ message: (err as Error)?.message });
        },
      });
      return yield* this.#broadcastResponse(
        yield* this.get(keyValue),
        options?.broadcast,
      );
    });
  }

  #parseData(data: any) {
    const payload = this.#eschema.parse(JSON.parse(data.data as string)).value;
    const metadata = metaSchema.parse({ ...data, _d: Boolean(data._d) });

    return {
      _tag: 'std-toolkit/broadcast',
      value: payload,
      meta: metadata,
    } satisfies typeof broadcastSchema.Type;
  }

  #broadcastResponse<T extends Omit<typeof broadcastSchema.Type, '_tag'>>(
    value: T,
    to: BroadcastTo['to'] = 'others',
  ): Effect.Effect<BroadcastSchemaType<T['value']>> {
    const broadcastValue = {
      _tag: 'std-toolkit/broadcast',
      ...value,
      meta: {
        ...value.meta,
        // HACK: Since sqlite do not support booleans.
        _d: Boolean(value.meta),
      },
    } as BroadcastSchemaType<T['value']>;
    console.log('BROADCASTING>>>', broadcastValue);

    return Effect.gen(this, function* () {
      const broadcast = (yield* Effect.serviceOption(BroadcastService)).pipe(
        Option.getOrUndefined,
      );
      const connectionIds = (yield* Effect.serviceOption(
        ConnectionService,
      )).pipe(
        Option.map((v) => [v.connectionId]),
        Option.getOrElse<string[]>(() => []),
      );
      broadcast?.broadcast({
        value: broadcastValue,
        to,
        connectionIds,
      });

      return broadcastValue;
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

    {
      limit = 10000,
      debug = false,
    }: {
      limit?: number;
      debug?: boolean;
    } = {},
  ) {
    const testPk = deriveIndexKeyValue(this.#primaryDerivation['pk'], pk);
    const testSk = this.#calculateSk(this.#primaryDerivation, sk as any);

    const { skQuery, skValue, orderBy } = (() => {
      const dsk = toDiscriminatedGeneric(testSk);
      switch (dsk.type) {
        case '<':
        case '<=':
        case '>':
        case '>=':
          return {
            skQuery: `sk ${dsk.type} ?`,
            orderBy: `ORDER BY sk ${['<', '<='].includes(dsk.type) ? 'DESC' : 'ASC'}`,
            skValue: dsk.value,
          };
      }
    })();
    const query = sql`SELECT * FROM ${this.#table.tableName} WHERE pk = ? AND ${skQuery} ${orderBy} LIMIT ?`;
    const queryValues = [testPk, skValue, limit];

    if (debug) {
      console.log({ query, queryValues });
    }

    const values = this.#table.sql.exec(query, ...queryValues).toArray();
    return {
      items: values.map((v) => this.#parseData(v)),
    };
  }

  index<Alias extends keyof TSecondaryDerivationMap>(alias: Alias) {
    return {
      query: (
        {
          pk,
          sk,
        }: Record<
          'pk',
          Simplify<
            IndexKeyDerivationValue<TSecondaryDerivationMap[Alias]['pk']>
          >
        > &
          Record<
            'sk',
            SortKeyparameter<IndexKeyDerivationValue<
              TSecondaryDerivationMap[Alias]['sk']
            > | null>
          >,
        {
          limit = 10000,
          debug = false,
        }: {
          limit?: number;
          debug?: boolean;
        } = {},
      ) => {
        const indexDerivation = this.#secondaryDerivations[alias];
        const indexDef = this.#table.indexMap[indexDerivation.indexName];
        const testPk = deriveIndexKeyValue(indexDerivation.pk, pk);
        const testSk = this.#calculateSk(indexDerivation, sk as any);

        const { skQuery, skValue, orderBy } = (() => {
          const dsk = toDiscriminatedGeneric(testSk);
          if (dsk.value === null || dsk.value === undefined) {
            return { skQuery: `1=1`, orderBy: '', skValue: null };
          }
          switch (dsk.type) {
            case '<':
            case '<=':
            case '>':
            case '>=':
              return {
                skQuery: `${indexDef.sk} ${dsk.type} ?`,
                orderBy: `ORDER BY ${indexDef.sk} ${['<', '<='].includes(dsk.type) ? 'DESC' : 'ASC'}`,
                skValue: dsk.value,
              };
          }
        })();
        const query = sql`SELECT * from ${this.#table.tableName} where ${indexDef.pk} = ? AND ${skQuery} ${orderBy} LIMIT ?`;
        const queryValues = [testPk, skValue, limit].filter(isNotNullable);

        if (debug) {
          console.log({ query, queryValues });
        }

        return Effect.try({
          try: () => {
            const values = this.#table.sql
              .exec(query, ...queryValues)
              .toArray();
            return {
              items: values.map((v) => this.#parseData(v)),
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

  #deriveSecondaryIndexes(value: Partial<TSchema['Type'] & DerivableMeta>) {
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
  TSchema extends EmptyStdESchema,
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
    TPkKeys extends keyof (TSchema['Type'] & DerivableMeta),
    TSkKeys extends keyof (TSchema['Type'] & DerivableMeta),
  >(
    indexName: IndexName,
    alias: Alias,
    indexDerivation: {
      pk: IndexKeyDerivation<TSchema['Type'] & DerivableMeta, TPkKeys>;
      sk: IndexKeyDerivation<TSchema['Type'] & DerivableMeta, TSkKeys>;
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
            IndexKeyDerivation<TSchema['Type'] & DerivableMeta, TPkKeys>,
            IndexKeyDerivation<TSchema['Type'] & DerivableMeta, TSkKeys>
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
