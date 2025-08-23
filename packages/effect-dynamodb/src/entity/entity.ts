import type { ESchema, ESchemaType } from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { DynamoTable } from '../table/table.js';
import type { DynamoTableType, RealKeyFromIndex } from '../table/types.js';
import type { UnionKeys } from '../utils.js';

export interface IndexConfig<SchemaType, ReturnType> {
  schema: Schema.Schema<SchemaType>;
  fn: (value: SchemaType) => ReturnType;
}

export class DynamoEntity<
  PrimarySchema extends Partial<Schema.Schema.Type<ESchemaType<ESch>>>,
  Secondaries extends {
    [key in UnionKeys<DynamoTableType<Table>['SIs']>]?: IndexConfig<
      any,
      DynamoTableType<Table>['SIs'][key]
    >;
  },
  Table extends DynamoTable<any, any, any>,
  ESch extends ESchema<any, any>,
> {
  #table: Table;
  #eschema: ESch;
  #primary: IndexConfig<
    PrimarySchema,
    RealKeyFromIndex<DynamoTableType<Table>['primary']>
  >;
  #secondaries: Secondaries;

  private constructor(
    table: Table,
    eschema: ESch,
    primary: IndexConfig<
      PrimarySchema,
      RealKeyFromIndex<DynamoTableType<Table>['primary']>
    >,
    secondaries: Secondaries,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primary = primary;
    this.#secondaries = secondaries;
  }

  getItem() {}

  // BUILDER PATTERN FOR DynamoEntity
  static make<
    Table extends DynamoTable<any, any, any>,
    Sch extends ESchema<any, any>,
  >(table: Table, eschema: Sch) {
    return {
      primary<Primary extends Partial<Schema.Schema.Type<ESchemaType<Sch>>>>(
        primaryValue: IndexConfig<
          Primary,
          RealKeyFromIndex<DynamoTableType<Table>['primary']>
        >,
      ) {
        class EntitySecondaryIndexEnhancer<
          Secondaries extends {
            [key in UnionKeys<DynamoTableType<Table>['SIs']>]?: IndexConfig<
              any,
              DynamoTableType<Table>['SIs'][key]
            >;
          },
        > {
          #secondaries: Secondaries;
          constructor(config: Secondaries) {
            this.#secondaries = config;
          }
          secondary<
            Name extends UnionKeys<DynamoTableType<Table>['SIs']>,
            GSISchema extends Partial<Schema.Schema.Type<ESchemaType<Sch>>>,
          >(
            indexName: Name,
            config: IndexConfig<
              GSISchema,
              RealKeyFromIndex<DynamoTableType<Table>['SIs'][Name]>
            >,
          ): EntitySecondaryIndexEnhancer<
            Secondaries &
              Record<
                Name,
                IndexConfig<
                  GSISchema,
                  RealKeyFromIndex<DynamoTableType<Table>['SIs'][Name]>
                >
              >
          > {
            return new EntitySecondaryIndexEnhancer({
              ...config,
              [indexName]: config,
            } as any);
          }

          build() {
            return new DynamoEntity(
              table,
              eschema,
              primaryValue,
              this.#secondaries,
            );
          }
        }
        return new EntitySecondaryIndexEnhancer({});
      },
    };
  }
}
