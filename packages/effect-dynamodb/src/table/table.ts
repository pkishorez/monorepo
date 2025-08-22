/* eslint-disable ts/no-empty-object-type */
import type {
  DeleteItemInput,
  DynamoDB,
  GetItemInput,
  PutItemInput,
  UpdateItemInput,
} from 'dynamodb-client';
import type { ExprInput, KeyConditionExprParameters } from './expr/index.js';
import type { QueryOptions, ScanOptions } from './query-executor.js';
import type {
  DynamoConfig,
  IndexDefinition,
  ItemForPut,
  ItemWithKeys,
  KeyFromIndex,
  SecondaryIndexDefinition,
  Simplify,
} from './types.js';
import { createDynamoDB } from 'dynamodb-client';
import { Effect } from 'effect';
import { expr, projectionExpr } from './expr/index.js';
import { DynamoQueryExecutor } from './query-executor.js';
import { marshall, unmarshall } from './utils.js';

export class DynamoTable<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, SecondaryIndexDefinition> = {},
  TLSIs extends Record<string, SecondaryIndexDefinition> = {},
  Type = {},
> {
  readonly #name: string;
  readonly #client: DynamoDB;
  readonly #queryExecutor: DynamoQueryExecutor<unknown>;

  readonly primary: TPrimary;
  readonly gsis: TGSIs;
  readonly lsis: TLSIs;

  constructor(config: {
    name: string;
    primary: TPrimary;
    gsis: TGSIs;
    lsis: TLSIs;
    dynamoConfig: DynamoConfig;
    value: Type;
  }) {
    this.#name = config.name;
    this.primary = config.primary;
    this.gsis = config.gsis;
    this.lsis = config.lsis;

    this.#client = createDynamoDB({
      region: config.dynamoConfig.region || 'us-east-1',
      credentials: {
        accessKeyId: config.dynamoConfig.accessKey,
        secretAccessKey: config.dynamoConfig.secretKey,
      },
      ...(config.dynamoConfig.endpoint && {
        endpoint: config.dynamoConfig.endpoint,
      }),
    });
    this.#queryExecutor = new DynamoQueryExecutor(this.#client, this.#name);
  }

  static make(name: string, dynamoConfig: DynamoConfig) {
    return new InitialTableBuilder(name, dynamoConfig);
  }

  get name(): string {
    return this.#name;
  }

  // Primary table operations
  getItem(
    key: KeyFromIndex<TPrimary>,
    {
      projection,
      ...options
    }: Omit<GetItemInput, 'Key' | 'TableName' | 'ProjectionExpression'> & {
      projection?: string[];
    } = {},
  ) {
    const getOptions: GetItemInput = {
      TableName: this.#name,
      Key: marshall(key),
      ...options,
    };

    if (projection) {
      const { expr: condition, exprAttributes } = projectionExpr(projection);
      getOptions.ProjectionExpression = condition;
      getOptions.ExpressionAttributeNames = exprAttributes;
    }

    return this.#client.getItem(getOptions).pipe(
      Effect.map((response) => ({
        ...response,
        Item: response.Item
          ? (unmarshall(response.Item) as ItemWithKeys<TPrimary>)
          : null,
      })),
    );
  }

  putItem(
    item: ItemForPut<TPrimary, TGSIs, TLSIs>,
    options?: Omit<
      PutItemInput,
      'TableName' | 'Item' | 'ConditionExpression'
    > & {
      condition?: ExprInput<Type>;
    },
  ) {
    const putItemOptions: PutItemInput = {
      TableName: this.#name,
      Item: marshall(item),
      ...options,
    };

    if (options?.condition) {
      const {
        expr: condition,
        exprAttributes,
        exprValues,
      } = expr(options.condition);
      putItemOptions.ConditionExpression = condition;
      putItemOptions.ExpressionAttributeNames = exprAttributes;
      // Only set ExpressionAttributeValues if there are values to set
      if (Object.keys(exprValues).length > 0) {
        putItemOptions.ExpressionAttributeValues = marshall(exprValues);
      }
    }

    return this.#client.putItem(putItemOptions).pipe(
      Effect.map((response) => ({
        ...response,
        Attributes: response.Attributes
          ? unmarshall(response.Attributes)
          : undefined,
      })),
    );
  }

  updateItem(
    key: KeyFromIndex<TPrimary>,
    options?: Omit<
      UpdateItemInput,
      'TableName' | 'Key' | 'ConditionExpression'
    > & {
      condition?: ExprInput<Type>;
    },
  ) {
    const updateItemOptions: UpdateItemInput = {
      TableName: this.#name,
      Key: marshall(key),
      ...options,
    };

    if (options?.condition) {
      const {
        expr: condition,
        exprAttributes,
        exprValues,
      } = expr(options.condition);
      updateItemOptions.ConditionExpression = condition;

      // Merge expression attribute names and values with existing ones
      updateItemOptions.ExpressionAttributeNames = {
        ...updateItemOptions.ExpressionAttributeNames,
        ...exprAttributes,
      };

      // Only merge condition values if there are values to merge
      if (Object.keys(exprValues).length > 0) {
        const marshalledConditionValues = marshall(exprValues);
        updateItemOptions.ExpressionAttributeValues = {
          ...updateItemOptions.ExpressionAttributeValues,
          ...marshalledConditionValues,
        };
      }
    }

    return this.#client.updateItem(updateItemOptions).pipe(
      Effect.map((response) => ({
        ...response,
        Attributes: response.Attributes
          ? unmarshall(response.Attributes)
          : undefined,
      })),
    );
  }

  deleteItem(
    key: KeyFromIndex<TPrimary>,
    options?: Omit<
      DeleteItemInput,
      'TableName' | 'Key' | 'ConditionExpression'
    > & {
      condition?: ExprInput<Type>;
    },
  ) {
    const deleteItemOptions: DeleteItemInput = {
      TableName: this.#name,
      Key: marshall(key),
      ...options,
    };

    if (options?.condition) {
      const {
        expr: condition,
        exprAttributes,
        exprValues,
      } = expr(options.condition);
      deleteItemOptions.ConditionExpression = condition;
      deleteItemOptions.ExpressionAttributeNames = exprAttributes;
      // Only set ExpressionAttributeValues if there are values to set
      if (Object.keys(exprValues).length > 0) {
        deleteItemOptions.ExpressionAttributeValues = marshall(exprValues);
      }
    }

    return this.#client.deleteItem(deleteItemOptions).pipe(
      Effect.map((response) => ({
        ...response,
        Attributes: response.Attributes
          ? unmarshall(response.Attributes)
          : undefined,
      })),
    );
  }

  query(
    key: KeyConditionExprParameters<TPrimary>,
    options?: QueryOptions<TPrimary, Type>,
  ) {
    return this.#queryExecutor.executeQuery(key, this.primary, options).pipe(
      Effect.map((response) => ({
        ...response,
        Items: (response.Items || []).map((item) =>
          unmarshall(item),
        ) as ItemWithKeys<TPrimary>[],
        LastEvaluatedKey: response.LastEvaluatedKey
          ? (unmarshall(response.LastEvaluatedKey) as KeyFromIndex<TPrimary>)
          : undefined,
      })),
    );
  }

  scan(options?: ScanOptions<TPrimary, Type>) {
    return this.#queryExecutor.executeScan(options).pipe(
      Effect.map((response) => ({
        ...response,
        Items: (response.Items || []).map((item) =>
          unmarshall(item),
        ) as ItemWithKeys<TPrimary>[],
        LastEvaluatedKey: response.LastEvaluatedKey
          ? (unmarshall(response.LastEvaluatedKey) as KeyFromIndex<TPrimary>)
          : undefined,
      })),
    );
  }

  // GSI operations
  gsi<TName extends keyof TGSIs>(indexName: TName) {
    return {
      query: (
        key: KeyConditionExprParameters<TGSIs[TName]>,
        options?: QueryOptions<TGSIs[TName], Type>,
      ) => {
        return this.#queryExecutor
          .executeQuery(key, this.gsis[indexName], {
            ...options,
            indexName: indexName as string,
          })
          .pipe(
            Effect.map((response) => ({
              ...response,
              Items: (response.Items || []).map((item) =>
                unmarshall(item),
              ) as ItemWithKeys<TPrimary>[],
              LastEvaluatedKey: response.LastEvaluatedKey
                ? (unmarshall(response.LastEvaluatedKey) as KeyFromIndex<
                    TGSIs[TName]
                  >)
                : undefined,
            })),
          );
      },

      scan: (options?: ScanOptions<TGSIs[TName], Type>) => {
        return this.#queryExecutor
          .executeScan({ ...options, indexName: indexName as string })
          .pipe(
            Effect.map((response) => ({
              ...response,
              Items: (response.Items || []).map((item) =>
                unmarshall(item),
              ) as ItemWithKeys<TPrimary>[],
              LastEvaluatedKey: response.LastEvaluatedKey
                ? (unmarshall(response.LastEvaluatedKey) as KeyFromIndex<
                    TGSIs[TName]
                  >)
                : undefined,
            })),
          );
      },
    };
  }

  // LSI operations
  lsi<TName extends keyof TLSIs>(indexName: TName) {
    type IndexDef = TLSIs[TName];

    return {
      query: (
        key: KeyConditionExprParameters<IndexDef>,
        options?: QueryOptions<IndexDef, Type>,
      ) => {
        return this.#queryExecutor
          .executeQuery(key, this.lsis[indexName], {
            ...options,
            indexName: indexName as string,
          })
          .pipe(
            Effect.map((response) => ({
              ...response,
              Items: (response.Items || []).map((item) =>
                unmarshall(item),
              ) as ItemWithKeys<TPrimary>[],
              LastEvaluatedKey: response.LastEvaluatedKey
                ? (unmarshall(response.LastEvaluatedKey) as KeyFromIndex<
                    TLSIs[TName]
                  >)
                : undefined,
            })),
          );
      },

      scan: (options?: ScanOptions<TLSIs[TName], Type>) => {
        return this.#queryExecutor
          .executeScan({ ...options, indexName: indexName as string })
          .pipe(
            Effect.map((response) => ({
              ...response,
              Items: (response.Items || []).map((item) =>
                unmarshall(item),
              ) as ItemWithKeys<TPrimary>[],
              LastEvaluatedKey: response.LastEvaluatedKey
                ? (unmarshall(response.LastEvaluatedKey) as KeyFromIndex<
                    TLSIs[TName]
                  >)
                : undefined,
            })),
          );
      },
    };
  }
}

// Initial builder - only shows primary() method
class InitialTableBuilder {
  readonly #name: string;
  readonly #dynamoConfig: DynamoConfig;

  constructor(name: string, dynamoConfig: DynamoConfig) {
    this.#name = name;
    this.#dynamoConfig = dynamoConfig;
  }

  primary<TPk extends string, TSk extends string | undefined = undefined>(
    pk: TPk,
    sk?: TSk,
  ): ConfiguredTableBuilder<
    TSk extends string ? { pk: TPk; sk: TSk } : { pk: TPk },
    {},
    {}
  > {
    const primaryIndex = (sk ? { pk, sk } : { pk }) as TSk extends string
      ? { pk: TPk; sk: TSk }
      : { pk: TPk };

    return new ConfiguredTableBuilder(
      this.#name,
      primaryIndex,
      {},
      {},
      this.#dynamoConfig,
    );
  }
}

// Configured builder - shows gsi(), lsi(), and build() methods
class ConfiguredTableBuilder<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, IndexDefinition> = {},
  TLSIs extends Record<string, IndexDefinition> = {},
> {
  readonly #name: string;
  readonly #primary: TPrimary;
  readonly #gsis: TGSIs;
  readonly #lsis: TLSIs;
  readonly #dynamoConfig: DynamoConfig;

  constructor(
    name: string,
    primary: TPrimary,
    gsis: TGSIs,
    lsis: TLSIs,
    dynamoConfig: DynamoConfig,
  ) {
    this.#name = name;
    this.#primary = primary;
    this.#gsis = gsis;
    this.#lsis = lsis;
    this.#dynamoConfig = dynamoConfig;
  }

  gsi<
    TName extends string,
    TPk extends string,
    TSk extends string | undefined = undefined,
  >(
    name: TName,
    pk: TPk,
    sk?: TSk,
  ): ConfiguredTableBuilder<
    TPrimary,
    Simplify<
      TGSIs &
        Record<TName, TSk extends string ? { pk: TPk; sk: TSk } : { pk: TPk }>
    >,
    TLSIs
  > {
    const gsiIndex = (sk ? { pk, sk } : { pk }) as TSk extends string
      ? { pk: TPk; sk: TSk }
      : { pk: TPk };

    const newGSIs = { ...this.#gsis, [name]: gsiIndex } as Simplify<
      TGSIs &
        Record<TName, TSk extends string ? { pk: TPk; sk: TSk } : { pk: TPk }>
    >;

    return new ConfiguredTableBuilder(
      this.#name,
      this.#primary,
      newGSIs,
      this.#lsis,
      this.#dynamoConfig,
    );
  }

  lsi<TName extends string, TSk extends string>(
    name: TName,
    sk: TSk,
  ): ConfiguredTableBuilder<
    TPrimary,
    TGSIs,
    Simplify<
      TLSIs &
        Record<
          TName,
          TPrimary extends { pk: infer PK } ? { pk: PK; sk: TSk } : never
        >
    >
  > {
    const lsiIndex = { pk: this.#primary.pk, sk } as TPrimary extends {
      pk: infer PK;
    }
      ? { pk: PK; sk: TSk }
      : never;

    const newLSIs = { ...this.#lsis, [name]: lsiIndex } as Simplify<
      TLSIs &
        Record<
          TName,
          TPrimary extends { pk: infer PK } ? { pk: PK; sk: TSk } : never
        >
    >;

    return new ConfiguredTableBuilder(
      this.#name,
      this.#primary,
      this.#gsis,
      newLSIs,
      this.#dynamoConfig,
    );
  }

  build<Type>(): DynamoTable<TPrimary, TGSIs, TLSIs> {
    return new DynamoTable({
      name: this.#name,
      primary: this.#primary,
      gsis: this.#gsis,
      lsis: this.#lsis,
      dynamoConfig: this.#dynamoConfig,
      value: {} as Type,
    });
  }
}
