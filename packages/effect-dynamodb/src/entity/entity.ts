import type { ESchema, ExtractESchemaType } from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { KeyConditionExprParameters } from '../table/expr/index.js';
import type { QueryOptions } from '../table/query-executor.js';
import type { DynamoTable, PutOptions } from '../table/table.js';
import type {
  CompoundIndexDefinition,
  IndexDefinition,
} from '../table/types.js';
import type {
  EntityIndexDefinition,
  ExtractIndexDefType,
  FirstLevelPrimitives,
  IndexDef,
  ObjFromKeysArr,
  ObjIndexDef,
} from './types.js';
import { Effect } from 'effect';
import { deriveIndex } from './util.js';

export class DynamoEntity<
  TSchema extends ESchema<any, any>,
  TTable extends DynamoTable<
    IndexDefinition,
    Record<string, IndexDefinition>,
    ExtractESchemaType<TSchema>
  >,
  TPrimary extends EntityIndexDefinition<
    any,
    any,
    any,
    Record<string, ObjIndexDef<any, any>>
  >,
  TSecondary extends Record<
    keyof TTable['secondaryIndexes'],
    EntityIndexDefinition<any, any, any, Record<string, ObjIndexDef<any, any>>>
  >,
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

  put(
    item: ExtractESchemaType<TSchema>,
    options?: PutOptions<ExtractESchemaType<TSchema>>,
  ) {
    const pk = deriveIndex(this.primary.pk, item);
    const sk = deriveIndex(this.primary.sk, item);

    return this.eschema.makeEffect(item).pipe(
      Effect.andThen(() =>
        this.table.putItem(
          {
            [this.table.primary.pk]: pk,
            [this.table.primary.sk]: sk,
          },
          item,
          options,
        ),
      ),
    );
  }
  index<IndexName extends keyof TSecondary>(indexName: IndexName) {
    return {
      query: (
        pk: ExtractIndexDefType<TSecondary[IndexName]['pk']>,
        options: QueryOptions<
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
    options: QueryOptions<TTable['primary'], ExtractESchemaType<TSchema>> = {},
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
    TESchema extends ESchema<any, any>,
    TTable extends DynamoTable<CompoundIndexDefinition, any, any>,
  >({ eschema, table }: { eschema: TESchema; table: TTable }) {
    type TItem = Schema.Schema.Type<TESchema['schema']>;

    return {
      primary<
        PkKeys extends (keyof FirstLevelPrimitives<TItem>)[],
        SkKeys extends (keyof FirstLevelPrimitives<TItem>)[],
        AccessPatterns extends Record<string, ObjIndexDef<TItem, SkKeys>>,
      >({
        pk,
        sk,
        accessPatterns,
      }: {
        pk: IndexDef<TItem, PkKeys>;
        sk: IndexDef<TItem, SkKeys>;
        accessPatterns?: (
          fn: <Keys extends SkKeys>(
            v: ObjIndexDef<TItem, Keys>,
          ) => ObjIndexDef<TItem, Keys>,
        ) => AccessPatterns;
      }) {
        return new SecondaryIndexCreator(eschema, table, {
          pk,
          sk,
          accessPatterns: accessPatterns?.((v) => v) ?? ({} as AccessPatterns),
        });
      },
    } as const;
  }
}

class SecondaryIndexCreator<
  TSchema extends ESchema<any, any>,
  TTable extends DynamoTable<
    IndexDefinition,
    Record<string, IndexDefinition>,
    ExtractESchemaType<TSchema>
  >,
  TPrimary extends EntityIndexDefinition<
    any,
    any,
    any,
    Record<string, ObjIndexDef<any, any>>
  >,
  TSecondary extends Record<
    keyof TTable['secondaryIndexes'],
    EntityIndexDefinition<any, any, any, Record<string, ObjIndexDef<any, any>>>
  >,
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
      ObjIndexDef<Schema.Schema.Type<TSchema['schema']>, SkKeys>
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
          v: ObjIndexDef<Schema.Schema.Type<TSchema['schema']>, Keys>,
        ) => ObjIndexDef<Schema.Schema.Type<TSchema['schema']>, Keys>,
      ) => AccessPatterns;
    },
  ) {
    const indexDef = {
      pk,
      sk,
      accessPatterns: accessPatterns?.((v) => v) ?? ({} as AccessPatterns),
    } as EntityIndexDefinition<any, PkKeys, SkKeys, AccessPatterns>;
    return new SecondaryIndexCreator(
      this.#eschema,
      this.#table,
      this.#primary,
      {
        ...this.#secondary,
        [name]: indexDef,
      } as TSecondary & Record<Name, typeof indexDef>,
    );
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

function query<
  TTable extends DynamoTable<any, any, any>,
  TSchema extends ESchema<any, any>,
  Definition extends EntityIndexDefinition<
    any,
    any,
    any,
    Record<string, ObjIndexDef<any, any>>
  >,
  Options extends QueryOptions<any, any>,
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
            const results = (yield* Effect.all(
              Items.map((item) =>
                eschema
                  .parse(item)
                  .pipe(Effect.andThen((value) => value.value)),
              ),
            )) as typeof Items;
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
