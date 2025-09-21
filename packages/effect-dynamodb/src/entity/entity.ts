import { EmptyESchema, ESchema, ExtractESchemaType } from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { Except, Simplify } from 'type-fest';
import type { QueryOptions } from '../table/query-executor.js';
import type { DynamoTable, PutOptions, UpdateOptions } from '../table/table.js';
import type {
  CompoundIndexDefinition,
  IndexDefinition,
} from '../table/types.js';
import type {
  EmptyEntityIndexDefinition,
  EntityIndexDefinition,
  ExtractEntityIndexDefType,
  ExtractIndexDefType,
  FirstLevelPrimitives,
  IndexDef,
  ObjFromKeysArr,
} from './types.js';
import type { SortKeyparameter } from '../table/expr/key-condition/types.js';
import { Effect } from 'effect';
import { deriveIndex } from './util.js';

export class DynamoEntity<
  TSchema extends EmptyESchema,
  TTable extends DynamoTable<
    IndexDefinition,
    Record<string, IndexDefinition>,
    ExtractESchemaType<TSchema>
  >,
  TPrimary extends EmptyEntityIndexDefinition,
  TSecondary extends Record<string, EmptyEntityIndexDefinition>,
> {
  eschema: TSchema;
  table: TTable;
  primary: TPrimary;
  secondary: TSecondary;

  constructor({
    eschema,
    table,
    primary,
    secondary,
  }: {
    eschema: TSchema;
    table: TTable;
    primary: TPrimary;
    secondary: TSecondary;
  }) {
    this.eschema = eschema;
    this.table = table;
    this.primary = primary;
    this.secondary = secondary;
  }

  #getRealKeyFromItem(key: ExtractEntityIndexDefType<TPrimary>) {
    const pk = deriveIndex(this.primary.pk, key);
    const sk = deriveIndex(this.primary.sk, key);

    const result = {
      [this.table.primary.pk]: pk,
      [this.table.primary.sk]: sk,
    };

    return result;
  }

  #deriveSecondaryKeys(item: Partial<ExtractESchemaType<TSchema>>) {
    const itemKeys = Object.keys(item);

    return Object.entries(this.secondary).reduce(
      (acc, [indexName, def]) => {
        const { pk, sk } = def;
        const pkDeps =
          pk.deps.length === 0 || pk.deps.every((dep) => itemKeys.includes(dep))
            ? {
                [this.table.secondaryIndexes[indexName].pk]: deriveIndex(
                  pk,
                  item,
                ),
              }
            : {};
        const skDeps =
          sk.deps.length === 0 || sk.deps.every((dep) => itemKeys.includes(dep))
            ? {
                [this.table.secondaryIndexes[indexName].sk]: deriveIndex(
                  sk,
                  item,
                ),
              }
            : {};

        return {
          ...acc,
          ...pkDeps,
          ...skDeps,
        };
      },
      {} as typeof item,
    ) as typeof item;
  }

  update(
    key: ExtractEntityIndexDefType<TPrimary>,
    update: Omit<
      Partial<ExtractESchemaType<TSchema>>,
      // One should not update the primary key itself!
      keyof ExtractEntityIndexDefType<TPrimary>
    >,
    options?: Except<UpdateOptions<ExtractESchemaType<TSchema>>, 'update'> & {
      ignoreVersionMismatch?: boolean;
    },
  ) {
    return this.eschema.makePartialEffect(update).pipe(
      Effect.andThen((v) =>
        this.table.updateItem(this.#getRealKeyFromItem(key), {
          ...options,
          update: {
            ...v,
            ...this.#deriveSecondaryKeys({ ...v, ...key } as any),
          },
          condition: options?.ignoreVersionMismatch
            ? undefined
            : ({
                __v: this.eschema.latestVersion,
              } as any),
        }),
      ),
    );
  }

  purge(confirm: 'i know what i am doing') {
    if (confirm !== 'i know what i am doing') {
      return Effect.void;
    }

    const th = this;
    return Effect.gen(function* () {
      let lastEvaluated: Record<string, string> | undefined;
      let count = 0;

      while (true) {
        const { Items, LastEvaluatedKey } = yield* th.table.scan({
          exclusiveStartKey: lastEvaluated,
        });
        count += Items.length;
        lastEvaluated = LastEvaluatedKey as any;

        yield* Effect.all(
          Items.map((item) =>
            th.table.deleteItem(th.#getRealKeyFromItem(item)),
          ),
          { concurrency: 'unbounded' },
        );

        if (!lastEvaluated) {
          break;
        }
      }
      return count;
    });
  }

  put(
    item: ExtractESchemaType<TSchema>,
    options?: PutOptions<ExtractESchemaType<TSchema>>,
  ) {
    return this.eschema
      .makeEffect(item)
      .pipe(
        Effect.andThen(() =>
          this.table.putItem(
            this.#getRealKeyFromItem(item),
            this.eschema.make({ ...item, ...this.#deriveSecondaryKeys(item) }),
            options,
          ),
        ),
      );
  }
  index<IndexName extends keyof TSecondary>(indexName: IndexName) {
    return {
      query: (
        {
          pk,
          sk,
        }: {
          pk: ExtractIndexDefType<TSecondary[IndexName]['pk']>;
          sk?: Simplify<
            SortKeyparameter<
              Simplify<
                Partial<
                  ObjFromKeysArr<
                    ExtractESchemaType<TSchema>,
                    TSecondary[IndexName]['sk']['deps']
                  >
                >
              >
            >
          >;
        },
        options: EntityQueryOptions<
          IndexName extends keyof TTable['secondaryIndexes']
            ? TTable['secondaryIndexes'][IndexName]
            : never,
          ExtractESchemaType<TSchema>
        > = {},
      ) => {
        const definition = this.secondary[indexName] as TSecondary[IndexName];
        if (!definition) {
          throw new Error('do not work');
        }
        return query(
          {
            table: this.table,
            eschema: this.eschema,
            pk: deriveIndex(definition.pk, pk),
            sk: sk && querySkParams(definition.sk, sk),
            index: indexName as string,
          },
          options,
        );
      },
    };
  }

  query(
    {
      pk,
      sk,
    }: {
      pk: ExtractIndexDefType<TPrimary['pk']>;
      sk?: Simplify<
        SortKeyparameter<
          Simplify<
            Partial<
              ObjFromKeysArr<
                ExtractESchemaType<TSchema>,
                TPrimary['sk']['deps']
              >
            >
          >
        >
      >;
    },
    options: EntityQueryOptions<
      TTable['primary'],
      ExtractESchemaType<TSchema>
    > = {},
  ) {
    return query(
      {
        table: this.table,
        eschema: this.eschema,
        pk: deriveIndex(this.primary.pk, pk),
        sk: sk ? querySkParams(this.primary.sk, sk) : undefined,
      },
      options,
    );
  }

  static make<
    TESchema extends ESchema<any>,
    TTable extends DynamoTable<CompoundIndexDefinition, any, any>,
  >({ eschema, table }: { eschema: TESchema; table: TTable }) {
    type TItem = Schema.Schema.Type<TESchema['schema']>;

    return {
      primary<
        PkKeys extends (keyof FirstLevelPrimitives<TItem>)[],
        SkKeys extends (keyof FirstLevelPrimitives<TItem>)[],
      >({
        pk,
        sk,
      }: {
        pk: IndexDef<TItem, PkKeys>;
        sk: IndexDef<TItem, SkKeys>;
      }) {
        return new SecondaryIndexCreator<
          TESchema,
          TTable,
          EntityIndexDefinition<TItem, PkKeys, SkKeys>,
          {} // Start with empty secondary indexes
        >(eschema, table, {
          pk,
          sk,
        });
      },
    } as const;
  }
}

class SecondaryIndexCreator<
  TSchema extends ESchema<any>,
  TTable extends DynamoTable<
    IndexDefinition,
    Record<string, IndexDefinition>,
    ExtractESchemaType<TSchema>
  >,
  TPrimary extends EmptyEntityIndexDefinition,
  TSecondary extends Record<string, EmptyEntityIndexDefinition>,
> {
  #eschema: TSchema;
  #table: TTable;
  #primary: TPrimary;
  #secondary: TSecondary;
  constructor(
    eschema: TSchema,
    table: TTable,
    primary: TPrimary,
    secondary?: TSecondary,
  ) {
    this.#eschema = eschema;
    this.#table = table;
    this.#primary = primary;
    this.#secondary = secondary ?? ({} as TSecondary);
  }

  index<
    Name extends keyof TTable['secondaryIndexes'],
    PkKeys extends (keyof FirstLevelPrimitives<
      Schema.Schema.Type<TSchema['schema']>
    >)[],
    SkKeys extends (keyof FirstLevelPrimitives<
      Schema.Schema.Type<TSchema['schema']>
    >)[],
  >(
    name: Name,
    {
      pk,
      sk,
    }: {
      pk: IndexDef<Schema.Schema.Type<TSchema['schema']>, PkKeys>;
      sk: IndexDef<Schema.Schema.Type<TSchema['schema']>, SkKeys>;
    },
  ): SecondaryIndexCreator<
    TSchema,
    TTable,
    TPrimary,
    TSecondary & Record<Name, EntityIndexDefinition<any, PkKeys, SkKeys>>
  > {
    const indexDef = {
      pk,
      sk,
    } as EntityIndexDefinition<any, PkKeys, SkKeys>;
    return new SecondaryIndexCreator<
      TSchema,
      TTable,
      TPrimary,
      TSecondary & Record<Name, typeof indexDef>
    >(this.#eschema, this.#table, this.#primary, {
      ...this.#secondary,
      [name]: indexDef,
    } as TSecondary & Record<Name, typeof indexDef>);
  }

  build() {
    return new DynamoEntity({
      eschema: this.#eschema,
      table: this.#table,
      primary: this.#primary,
      secondary: this.#secondary,
    });
  }
}

type EntityQueryOptions<A extends IndexDefinition, B> = QueryOptions<A, B> & {
  onExcessProperty?: 'ignore' | 'error' | 'preserve';
};
function query<
  TTable extends DynamoTable<any, any, any>,
  TSchema extends EmptyESchema,
  Options extends EntityQueryOptions<any, any>,
>(
  {
    table,
    eschema,
    pk,
    sk,
    index,
  }: {
    table: TTable;
    eschema: TSchema;
    pk: string;
    sk?: SortKeyparameter<string> | undefined;
    index?: string;
  },
  options?: Options,
) {
  return (index ? table.index(index) : table).query({ pk, sk }, options).pipe(
    Effect.andThen(({ Items, ...others }) =>
      Effect.gen(function* () {
        const results = yield* Effect.all(
          Items.map((item) =>
            eschema
              .parse(item, {
                onExcessProperty: options?.onExcessProperty ?? 'ignore',
              })
              .pipe(
                Effect.map(
                  (value) => value.value as ExtractESchemaType<TSchema>,
                ),
              ),
          ),
        );
        return {
          Items: results,
          ...others,
        };
      }),
    ),
  );
}

function querySkParams<Def extends IndexDef<any, any>>(
  def: Def,
  skValue: SortKeyparameter<ExtractIndexDefType<Def>>,
): SortKeyparameter<string> {
  if ('beginsWith' in skValue) {
    return { beginsWith: deriveIndex(def, skValue.beginsWith) };
  }
  if ('between' in skValue) {
    const [val1, val2] = skValue.between;
    return { between: [deriveIndex(def, val1), deriveIndex(def, val2)] };
  }
  if ('<' in skValue) {
    return { '<': deriveIndex(def, skValue['<']) };
  }
  if ('<=' in skValue) {
    return { '<': deriveIndex(def, skValue['<=']) };
  }
  if ('>' in skValue) {
    return { '<': deriveIndex(def, skValue['>']) };
  }
  if ('>=' in skValue) {
    return { '<': deriveIndex(def, skValue['>=']) };
  }

  throw new Error('Exhaustive check...');
}
