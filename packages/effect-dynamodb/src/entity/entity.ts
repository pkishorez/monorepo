import type {
  EmptyESchema,
  ESchema,
  ExtractESchemaType,
} from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { Except } from 'type-fest';
import type { KeyConditionExprParameters } from '../table/expr/index.js';
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
        // Only derive pk if ALL its dependencies are present in the update
        const pkDeps =
          pk.deps.length === 0 || pk.deps.every((dep) => itemKeys.includes(dep))
            ? { [this.table.secondaryIndexes[indexName].pk]: pk.derive(item) }
            : {};
        // Only derive sk if ALL its dependencies are present in the update
        const skDeps =
          sk.deps.length === 0 || sk.deps.every((dep) => itemKeys.includes(dep))
            ? { [this.table.secondaryIndexes[indexName].sk]: sk.derive(item) }
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
            { ...item, ...this.#deriveSecondaryKeys(item) },
            options,
          ),
        ),
      );
  }
  index<IndexName extends keyof TSecondary>(indexName: IndexName) {
    return {
      query: (
        pk: ExtractIndexDefType<TSecondary[IndexName]['pk']>,
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
            definition,
            pk,
            index: indexName as string,
          },
          options,
        );
      },
    };
  }

  query(
    pk: ExtractIndexDefType<TPrimary['pk']>,
    options: EntityQueryOptions<
      TTable['primary'],
      ExtractESchemaType<TSchema>
    > = {},
  ) {
    return query(
      {
        table: this.table,
        eschema: this.eschema,
        definition: this.primary,
        pk,
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
        AccessPatterns extends Record<string, IndexDef<TItem, SkKeys>>,
      >({
        pk,
        sk,
        accessPatterns,
      }: {
        pk: IndexDef<TItem, PkKeys>;
        sk: IndexDef<TItem, SkKeys>;
        accessPatterns?: (
          fn: <Keys extends SkKeys>(
            v: IndexDef<TItem, Keys>,
          ) => IndexDef<TItem, Keys>,
        ) => AccessPatterns;
      }) {
        return new SecondaryIndexCreator<
          TESchema,
          TTable,
          EntityIndexDefinition<TItem, PkKeys, SkKeys, AccessPatterns>,
          {} // Start with empty secondary indexes
        >(eschema, table, {
          pk,
          sk,
          accessPatterns: accessPatterns?.((v) => v) ?? ({} as AccessPatterns),
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
    AccessPatterns extends Record<
      string,
      IndexDef<Schema.Schema.Type<TSchema['schema']>, SkKeys>
    >,
  >(
    name: Name,
    {
      pk,
      sk,
      accessPatterns,
    }: {
      pk: IndexDef<Schema.Schema.Type<TSchema['schema']>, PkKeys>;
      sk: IndexDef<Schema.Schema.Type<TSchema['schema']>, SkKeys>;
      accessPatterns?: (
        fn: <Keys extends SkKeys>(
          v: IndexDef<Schema.Schema.Type<TSchema['schema']>, Keys>,
        ) => IndexDef<Schema.Schema.Type<TSchema['schema']>, Keys>,
      ) => AccessPatterns;
    },
  ): SecondaryIndexCreator<
    TSchema,
    TTable,
    TPrimary,
    TSecondary &
      Record<Name, EntityIndexDefinition<any, PkKeys, SkKeys, AccessPatterns>>
  > {
    const indexDef = {
      pk,
      sk,
      accessPatterns: accessPatterns?.((v) => v) ?? ({} as AccessPatterns),
    } as EntityIndexDefinition<any, PkKeys, SkKeys, AccessPatterns>;
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
  TSchema extends ESchema<any>,
  Definition extends EntityIndexDefinition<
    any,
    any,
    any,
    Record<string, IndexDef<any, any>>
  >,
  Options extends EntityQueryOptions<any, any>,
>(
  {
    table,
    eschema,
    definition,
    pk,
    index,
  }: {
    table: TTable;
    eschema: TSchema;
    definition: Definition;
    pk: ExtractIndexDefType<Definition['pk']>;
    index?: string;
  },
  options?: Options,
) {
  const pkValue = deriveIndex(definition.pk, pk);

  const exec = (sk?: KeyConditionExprParameters['sk']) => {
    return (index ? table.index(index) : table)
      .query({ pk: pkValue, sk }, options)
      .pipe(
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
  };

  type AccessPatternTypes =
    Definition extends EntityIndexDefinition<
      any,
      any,
      any,
      infer AccessPatterns
    >
      ? AccessPatterns
      : never;
  const accessPatternOperations = Object.fromEntries(
    Object.entries(definition.accessPatterns ?? {}).map(([key, value]) => {
      return [
        key,
        {
          between: (val1: any, val2: any) => {
            return exec({
              between: [value.derive(val1), value.derive(val2)],
            });
          },
          prefix: (val: any) => {
            return exec({ beginsWith: value.derive(val) });
          },
        },
      ];
    }),
  ) as {
    [K in keyof AccessPatternTypes]: {
      prefix: (
        val: ObjFromKeysArr<
          ExtractESchemaType<TSchema>,
          AccessPatternTypes[K]['deps']
        >,
      ) => ReturnType<typeof exec>;
      between: (
        va1: ObjFromKeysArr<
          ExtractESchemaType<TSchema>,
          AccessPatternTypes[K]['deps']
        >,
        va2: ObjFromKeysArr<
          ExtractESchemaType<TSchema>,
          AccessPatternTypes[K]['deps']
        >,
      ) => ReturnType<typeof exec>;
    };
  };

  return {
    ...accessPatternOperations,
    exec,
  };
}
