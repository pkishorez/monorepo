import type { ESchema } from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { Simplify } from 'type-fest';
import type { DynamoTable } from '../table/table.js';
import type { CompoundIndexDefinition } from '../table/types.js';
import type {
  EntityIndexDefinition,
  FirstLevelPrimitives,
  IndexDef,
} from './types.js';

export class DynamoEntity<
  TSchema extends ESchema<any, any>,
  TTable extends DynamoTable<any, any, any>,
> {
  eschema: TSchema;
  table: TTable;

  constructor({ eschema, table }: { eschema: TSchema; table: TTable }) {
    this.eschema = eschema;
    this.table = table;
  }

  query() {}

  static make<
    TESchema extends ESchema<any, any>,
    TTable extends DynamoTable<CompoundIndexDefinition, any, any>,
  >(_eschema: TESchema, _table: TTable) {
    type TItem = Schema.Schema.Type<TESchema['schema']>;
    type Indexes =
      TTable extends DynamoTable<
        infer PrimaryIndex,
        infer SecondaryIndexes,
        any
      >
        ? [PrimaryIndex, SecondaryIndexes]
        : never;
    type SecondaryIndexes = Indexes[1];

    return {
      pk<PkKeys extends (keyof FirstLevelPrimitives<TItem>)[]>(
        pk: IndexDef<TItem, PkKeys>,
      ) {
        return {
          sk<SkKeys extends (keyof FirstLevelPrimitives<TItem>)[]>(
            sk: IndexDef<TItem, SkKeys>,
          ) {
            const primary: EntityIndexDefinition<TItem, PkKeys, SkKeys> = {
              pk,
              sk,
            };

            const buildIndex = <Value, Index extends keyof SecondaryIndexes>(
              value: Value,
              indexName: Index,
            ) => {
              return {
                pk<PkKeys extends (keyof FirstLevelPrimitives<TItem>)[]>(
                  pk: IndexDef<TItem, PkKeys>,
                ) {
                  return {
                    sk<SkKeys extends (keyof FirstLevelPrimitives<TItem>)[]>(
                      sk: IndexDef<TItem, SkKeys>,
                    ) {
                      const secondary = {
                        ...value,
                        [indexName]: { pk, sk },
                      } as Value &
                        Record<
                          Index,
                          EntityIndexDefinition<TItem, PkKeys, SkKeys>
                        >;
                      return {
                        index(index: Index) {
                          return buildIndex(secondary, index);
                        },
                        build() {
                          return {
                            primary,
                            secondary: secondary as Simplify<typeof secondary>,
                          };
                        },
                      };
                    },
                  };
                },
              };
            };

            return {
              index<Index extends keyof SecondaryIndexes>(index: Index) {
                return buildIndex({} as const, index);
              },
            };
          },
        };
      },
    } as const;
  }
}
