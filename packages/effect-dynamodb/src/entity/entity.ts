/* eslint-disable ts/no-this-alias */
import type { ESchema } from '@monorepo/eschema';
import type { KeyConditionExpr } from '../table/expr/index.js';
import type { QueryOptions } from '../table/query-executor.js';
import type {
  DeleteOptions,
  DynamoTable,
  PutOptions,
  UpdateOptions,
} from '../table/table.js';
import type {
  CompoundIndexDefinition,
  DynamoTableType,
  KeyTypeFromIndex,
} from '../table/types.js';
import type { UnionKeys } from '../utils.js';
import { Effect, Option, Schema } from 'effect';

export interface Def<T> {
  schema: Schema.Schema<T>;
  fn: (value: T) => string;
}

export type IndexConfig<PkSchemaType, SkSchemaType, ReturnType> =
  ReturnType extends CompoundIndexDefinition
    ? {
        pk: Def<PkSchemaType>;
        sk: Def<SkSchemaType>;
      }
    : {
        pk: Def<PkSchemaType>;
      };

export class DynamoEntity<
  PrimarySchema extends Partial<Schema.Schema.Type<ESch>>,
  SkPrimarySchema extends Partial<Schema.Schema.Type<ESch>>,
  Secondaries extends {
    [key in UnionKeys<
      DynamoTableType<Table>['secondaryIndexes']
    >]?: IndexConfig<any, any, DynamoTableType<Table>['secondaryIndexes'][key]>;
  },
  Table extends DynamoTable<any, any>,
  ESch extends Schema.Schema<any>,
> {
  #table: Table;
  #eschema: ESchema<ESch, []>;
  #primary: IndexConfig<
    PrimarySchema,
    SkPrimarySchema,
    KeyTypeFromIndex<DynamoTableType<Table>['primary']>
  >;
  #secondaries: Secondaries;

  private constructor(
    table: Table,
    eschema: ESchema<ESch, []>,
    primary: IndexConfig<
      PrimarySchema,
      SkPrimarySchema,
      KeyTypeFromIndex<DynamoTableType<Table>['primary']>
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

  private getTotalPrimaryKey(value: PrimarySchema & SkPrimarySchema) {
    const config = this.#primary;
    const key = {} as CompoundIndexDefinition;

    if (!Schema.is(config.pk.schema, { onExcessProperty: 'ignore' })(value)) {
      return key;
    }
    if (
      'sk' in config &&
      Schema.is(config.sk.schema, { onExcessProperty: 'ignore' })(value)
    ) {
      key.sk = config.sk.fn(value);
    }

    key.pk = config.pk.fn(value);
    return this.#table.getRealKey(key);
  }

  private deriveIndexKeys(value: Partial<Schema.Schema.Type<ESch>>) {
    const keyValue: Record<string, any> = {};

    for (const indexName in this.#secondaries) {
      const config = this.#secondaries[indexName];
      const keyConfig = this.#table.getSecondaryKey(indexName);

      if (!keyConfig || !config) {
        continue;
      }

      if (Schema.is(config.pk.schema)(value)) {
        keyValue[keyConfig.pk] = config.pk.fn(value);
      }
      if (
        'sk' in config &&
        'sk' in keyConfig &&
        Schema.is(config.sk.schema)(value)
      ) {
        keyValue[keyConfig.sk] = config.sk.fn(value);
      }
    }

    return keyValue;
  }

  private getIndexPartitionKey(
    index: keyof Secondaries,
    value: Partial<Schema.Schema.Type<ESch>>,
  ) {
    const config = this.#secondaries[index];
    if (
      !(index in this.#table.secondaryIndexes) ||
      !config ||
      !Schema.is(config.pk.schema, {})(value)
    ) {
      throw new Error(`Invalid config for index ${index as string}.`);
    }

    const partition = config.pk.fn(value);

    return partition;
  }

  getItem(value: PrimarySchema & SkPrimarySchema) {
    const key = this.getTotalPrimaryKey(value);
    const th = this;

    return Effect.gen(function* () {
      const { Item, ...result } = yield* th.#table.getItem(key);

      if (Item === null) {
        return { ...result, Item: null };
      }

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
      const key = th.getTotalPrimaryKey(value);

      // Merge the key attributes with the item
      const itemWithKey = {
        ...key,
        ...(yield* th.#eschema.makeEffect(value)),
        ...th.deriveIndexKeys(value),
      };

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

  updateItem(
    value: PrimarySchema & SkPrimarySchema,
    options: UpdateOptions<ESch>,
  ) {
    const key = this.getTotalPrimaryKey(value);
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

  delete(value: PrimarySchema & SkPrimarySchema, options?: DeleteOptions) {
    const key = this.getTotalPrimaryKey(value);
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

  query(
    { pk, sk }: { pk: PrimarySchema; sk?: string | KeyConditionExpr<string> },
    options?: QueryOptions<DynamoTableType<Table>['primary']>,
  ) {
    return this.#table
      .query(
        {
          pk: this.#primary.pk.fn(pk),
          sk,
        },
        options,
      )
      .pipe(
        Effect.map(({ Items, ...rest }) => ({
          ...rest,
          Items: Items.map((item) =>
            Schema.decodeUnknownSync(Schema.partial(this.#eschema.schema))(
              item,
            ),
          ),
        })),
      );
  }

  index<TName extends keyof Secondaries>(indexName: TName) {
    return {
      query: (
        {
          pk,
          sk,
        }: {
          pk: TName extends keyof Secondaries
            ? Secondaries[TName] extends IndexConfig<infer Pk, any, any>
              ? Pk
              : never
            : never;
          sk?: string | KeyConditionExpr<string>;
        },

        options?: QueryOptions<DynamoTableType<Table>['primary']>,
      ) => {
        const partition = this.getIndexPartitionKey(indexName, pk as any);

        return this.#table
          .index(indexName)
          .query(
            {
              pk: partition,
              sk,
            },
            options,
          )
          .pipe(
            Effect.map(({ Items, ...rest }) => ({
              ...rest,
              Items: Items.map((item) =>
                Schema.decodeUnknownSync(Schema.partial(this.#eschema.schema))(
                  item,
                ),
              ),
            })),
          );
      },
    };
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
      primary<
        Primary extends Partial<Schema.Schema.Type<Sch>>,
        SkPrimary extends Partial<Schema.Schema.Type<Sch>>,
      >(
        primaryValue: IndexConfig<
          Primary,
          SkPrimary,
          KeyTypeFromIndex<DynamoTableType<Table>['primary']>
        >,
      ) {
        class EntitySecondaryIndexEnhancer<
          Secondaries extends {
            [key in UnionKeys<
              DynamoTableType<Table>['secondaryIndexes']
            >]?: IndexConfig<
              any,
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
            GSISkSchema extends Partial<Schema.Schema.Type<Sch>>,
          >(
            indexName: Name,
            config: IndexConfig<
              GSISchema,
              GSISkSchema,
              KeyTypeFromIndex<DynamoTableType<Table>['secondaryIndexes'][Name]>
            >,
          ): EntitySecondaryIndexEnhancer<
            Secondaries &
              Record<
                Name,
                IndexConfig<
                  GSISchema,
                  GSISkSchema,
                  KeyTypeFromIndex<
                    DynamoTableType<Table>['secondaryIndexes'][Name]
                  >
                >
              >
          > {
            return new EntitySecondaryIndexEnhancer({
              ...this.#secondaries,
              [indexName]: config,
            });
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
