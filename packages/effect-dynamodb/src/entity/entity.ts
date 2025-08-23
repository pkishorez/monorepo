/* eslint-disable ts/no-this-alias */
import type { ESchema, ESchemaType } from '@monorepo/eschema';
import type {
  DeleteOptions,
  DynamoTable,
  PutOptions,
  UpdateOptions,
} from '../table/table.js';
import type { DynamoTableType, RealKeyFromIndex } from '../table/types.js';
import type { UnionKeys } from '../utils.js';
import { Effect, Schema } from 'effect';

export interface IndexConfig<SchemaType, ReturnType> {
  schema: Schema.Schema<SchemaType>;
  fn: (value: SchemaType) => ReturnType;
}

export class DynamoEntity<
  PrimarySchema extends Partial<Schema.Schema.Type<ESchemaType<ESch>>>,
  Secondaries extends {
    [key in UnionKeys<
      DynamoTableType<Table>['secondaryIndexes']
    >]?: IndexConfig<any, DynamoTableType<Table>['secondaryIndexes'][key]>;
  },
  Table extends DynamoTable<any, any>,
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

  getItem(value: PrimarySchema) {
    const key = this.#primary.fn(value);
    const th = this;

    return Effect.gen(function* () {
      const { Item, ...result } = yield* th.#table.getItem(key);

      return {
        ...result,
        Item: yield* Schema.decodeUnknown(th.#primary.schema)(Item),
      };
    });
  }

  putItem(value: ESchemaType<ESch>, options?: PutOptions) {
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.putItem(value, options);

      return {
        ...result,
        Attributes: yield* Schema.decodeUnknown(
          Schema.partial(th.#eschema.schema),
        )(result.Attributes).pipe(
          Effect.onError(() => Effect.succeed(undefined)),
        ),
      };
    });
  }

  updateItem(
    value: ESchemaType<ESch>,
    options: UpdateOptions<ESchemaType<ESch>>,
  ) {
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.updateItem(value, options);

      return {
        ...result,
        Attributes: yield* Schema.decodeUnknown(
          Schema.partial(th.#eschema.schema),
        )(result.Attributes).pipe(
          Effect.onError(() => Effect.succeed(undefined)),
        ),
      };
    });
  }

  delete(key: PrimarySchema, options?: DeleteOptions) {
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.deleteItem(key, options);

      return {
        ...result,
        Attributes: yield* th.parsePartial(result.Attributes),
      };
    });
  }

  private parsePartial(value: unknown) {
    return Schema.decodeUnknown<Partial<ESchemaType<ESch>>, never, never>(
      Schema.partial(this.#eschema.schema) as any,
    )(value).pipe(Effect.onError(() => Effect.succeed(undefined)));
  }

  // BUILDER PATTERN FOR DynamoEntity
  static make<
    Table extends DynamoTable<any, any>,
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
            [key in UnionKeys<
              DynamoTableType<Table>['secondaryIndexes']
            >]?: IndexConfig<
              any,
              DynamoTableType<Table>['secondaryIndexes'][key]
            >;
          },
        > {
          #secondaries: Secondaries;
          constructor(config: Secondaries) {
            this.#secondaries = config;
          }
          index<
            Name extends UnionKeys<DynamoTableType<Table>['secondaryIndexes']>,
            GSISchema extends Partial<Schema.Schema.Type<ESchemaType<Sch>>>,
          >(
            indexName: Name,
            config: IndexConfig<
              GSISchema,
              RealKeyFromIndex<DynamoTableType<Table>['secondaryIndexes'][Name]>
            >,
          ): EntitySecondaryIndexEnhancer<
            Secondaries &
              Record<
                Name,
                IndexConfig<
                  GSISchema,
                  RealKeyFromIndex<
                    DynamoTableType<Table>['secondaryIndexes'][Name]
                  >
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
