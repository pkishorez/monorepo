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
> {
  eschema: TSchema;
  table: TTable;
  primary: TPrimary;

  constructor({
    eschema,
    table,
    primary,
  }: {
    eschema: TSchema;
    table: TTable;
    primary: TPrimary;
  }) {
    this.eschema = eschema;
    this.table = table;
    this.primary = primary;
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

  query(
    pk: ExtractIndexDefType<TPrimary['pk']>,
    options: QueryOptions<TTable['primary'], ExtractESchemaType<TSchema>> = {},
  ) {
    const pkValue = deriveIndex(this.primary.pk, pk);
    const eschema = this.eschema;

    const exec = (sk?: KeyConditionExprParameters['sk']) => {
      return this.table.query({ pk: pkValue, sk }, options).pipe(
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

    type PrefixesType =
      TPrimary extends EntityIndexDefinition<any, any, any, infer Prefixes>
        ? Prefixes
        : never;
    const prefixOperations = Object.fromEntries(
      Object.entries(this.primary.prefixes ?? {}).map(([key, value]) => {
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
      [K in keyof PrefixesType]: {
        prefix: (
          val: ObjFromKeysArr<
            ExtractESchemaType<TSchema>,
            PrefixesType[K]['deps']
          >,
        ) => ReturnType<typeof exec>;
        between: (
          val1: ObjFromKeysArr<
            ExtractESchemaType<TSchema>,
            PrefixesType[K]['deps']
          >,
          val2: ObjFromKeysArr<
            ExtractESchemaType<TSchema>,
            PrefixesType[K]['deps']
          >,
        ) => ReturnType<typeof exec>;
      };
    };

    return {
      ...prefixOperations,
      exec,
    };
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
      >({
        pk,
        sk,
      }: {
        pk: IndexDef<TItem, PkKeys>;
        sk: IndexDef<TItem, SkKeys>;
      }) {
        const recurse = <
          PrimaryPrefixDef extends Record<string, ObjIndexDef<any, any>>,
        >(
          primaryPrefixDef: PrimaryPrefixDef,
        ) => ({
          prefix<
            Name extends `by${string}`,
            PrefixKeys extends keyof ObjFromKeysArr<TItem, SkKeys[]>,
          >(name: Name, def: ObjIndexDef<TItem, PrefixKeys>) {
            return recurse({
              ...primaryPrefixDef,
              [name]: def,
            } as PrimaryPrefixDef & Record<Name, typeof def>);
          },
          build() {
            const primary = {
              pk,
              sk,
              prefixes: primaryPrefixDef,
            } as EntityIndexDefinition<TItem, PkKeys, SkKeys, PrimaryPrefixDef>;

            return new DynamoEntity({ eschema, table, primary });
          },
        });

        return recurse({} as const);
      },
    } as const;
  }
}
