/* eslint-disable ts/no-this-alias */
import type { ESchema } from '@monorepo/eschema';
import type {
  DeleteOptions,
  DynamoTable,
  PutOptions,
  UpdateOptions,
} from '../table/table.js';
import type { DynamoTableType, RealKeyFromIndex } from '../table/types.js';
import type { UnionKeys } from '../utils.js';
import { Effect, Option, Schema } from 'effect';

export interface IndexConfig<SchemaType, ReturnType> {
  schema: Schema.Schema<SchemaType>;
  fn: (value: SchemaType) => ReturnType;
}

export class DynamoEntity<
  PrimarySchema extends Partial<Schema.Schema.Type<ESch>>,
  Secondaries extends {
    [key in UnionKeys<
      DynamoTableType<Table>['secondaryIndexes']
    >]?: IndexConfig<any, DynamoTableType<Table>['secondaryIndexes'][key]>;
  },
  Table extends DynamoTable<any, any>,
  ESch extends Schema.Schema<any>,
> {
  #table: Table;
  #eschema: ESchema<ESch, []>;
  #primary: IndexConfig<
    PrimarySchema,
    RealKeyFromIndex<DynamoTableType<Table>['primary']>
  >;
  #secondaries: Secondaries;

  private constructor(
    table: Table,
    eschema: ESchema<ESch, []>,
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

  make(value: Schema.Schema.Type<ESch>) {
    return this.#eschema.make(value);
  }
  getItem(value: PrimarySchema) {
    const key = this.#primary.fn(value);
    const th = this;

    return Effect.gen(function* () {
      const { Item, ...result } = yield* th.#table.getItem(key);

      if (Item === null) {
        return { ...result, Item: null };
      }

      console.error('ITEM: ', Item);

      return {
        ...result,
        Item: yield* th.#eschema.parse(Item),
      };
    });
  }

  putItem(value: Schema.Schema.Type<ESch>, options?: PutOptions) {
    const th = this;

    return Effect.gen(function* () {
      // Extract the primary key fields from the value
      const primaryKeyFields = yield* Schema.decodeUnknown(th.#primary.schema)(
        value,
      );
      const key = th.#primary.fn(primaryKeyFields);

      // Merge the key attributes with the item
      const itemWithKey = { ...key, ...th.make(value) };

      const result = yield* th.#table.putItem(itemWithKey, options);
      const parsedAttributes = yield* th.parsePartial(result.Attributes);

      return {
        ...result,
        Attributes: parsedAttributes as
          | Partial<Schema.Schema.Type<ESch>>
          | undefined,
      };
    });
  }

  updateItem(value: PrimarySchema, options: UpdateOptions<ESch>) {
    const key = this.#primary.fn(value);
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.updateItem(key, options);
      const parsedAttributes = yield* th.parsePartial(result.Attributes);

      return {
        ...result,
        Attributes: parsedAttributes as
          | Partial<Schema.Schema.Type<ESch>>
          | undefined,
      };
    });
  }

  delete(value: PrimarySchema, options?: DeleteOptions) {
    const key = this.#primary.fn(value);
    const th = this;

    return Effect.gen(function* () {
      const result = yield* th.#table.deleteItem(key, options);
      const parsedAttributes = yield* th.parsePartial(result.Attributes);

      return {
        ...result,
        Attributes: parsedAttributes as
          | Partial<Schema.Schema.Type<ESch>>
          | undefined,
      };
    });
  }

  private parsePartial(value: unknown) {
    return Schema.decodeUnknownOption<Partial<Schema.Schema.Type<ESch>>, never>(
      Schema.partial(this.#eschema.schema) as any,
    )(value).pipe(Option.orElse(() => Option.some(undefined)));
  }

  // BUILDER PATTERN FOR DynamoEntity
  static make<
    Table extends DynamoTable<any, any>,
    Sch extends Schema.Schema<any, any>,
  >(table: Table, eschema: ESchema<Sch, []>) {
    return {
      primary<Primary extends Partial<Schema.Schema.Type<Sch>>>(
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
            GSISchema extends Partial<Schema.Schema.Type<Sch>>,
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
