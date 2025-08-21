/* eslint-disable ts/no-empty-object-type */
import type {
  BatchGetItemInput,
  BatchWriteItemInput,
  ConsumedCapacity,
  DeleteItemInput,
  DynamoDB,
  GetItemInput,
  ItemCollectionMetrics,
  PutItemInput,
  QueryInput,
  ScanInput,
  TransactGetItemsInput,
  TransactWriteItemsInput,
  UpdateItemInput,
} from 'dynamodb-client';
import type {
  BatchGetResult,
  BatchWriteRequest,
  BatchWriteResult,
  DynamoConfig,
  IndexDefinition,
  ItemForPut,
  ItemWithKeys,
  KeyConditionExprParameters,
  KeyFromIndex,
  SecondaryIndexDefinition,
  Simplify,
  TransactGetItem,
  TransactGetResult,
  TransactWriteItem,
  TransactWriteResult,
} from './types.js';
import { createDynamoDB } from 'dynamodb-client';
import { Effect } from 'effect';
import { DynamoQueryExecutor } from './query-executor.js';
import { marshall, unmarshall } from './utils.js';

export class DynamoTable<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, SecondaryIndexDefinition> = {},
  TLSIs extends Record<string, SecondaryIndexDefinition> = {},
> {
  readonly #name: string;
  readonly #client: DynamoDB;
  readonly #queryExecutor: DynamoQueryExecutor;

  readonly primary: TPrimary;
  readonly gsis: TGSIs;
  readonly lsis: TLSIs;

  constructor(config: {
    name: string;
    primary: TPrimary;
    gsis: TGSIs;
    lsis: TLSIs;
    dynamoConfig: DynamoConfig;
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
  getItem(key: KeyFromIndex<TPrimary>, options?: Partial<GetItemInput>) {
    return this.#client
      .getItem({
        TableName: this.#name,
        Key: marshall(key),
        ...options,
      })
      .pipe(
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
    options?: Partial<PutItemInput>,
  ) {
    return this.#client
      .putItem({
        TableName: this.#name,
        Item: marshall(item),
        ...options,
      })
      .pipe(
        Effect.map((response) => ({
          ...response,
          Attributes: response.Attributes
            ? unmarshall(response.Attributes)
            : undefined,
        })),
      );
  }

  updateItem(key: KeyFromIndex<TPrimary>, options?: Partial<UpdateItemInput>) {
    return this.#client
      .updateItem({
        TableName: this.#name,
        Key: marshall(key),
        ...options,
      })
      .pipe(
        Effect.map((response) => ({
          ...response,
          Attributes: response.Attributes
            ? unmarshall(response.Attributes)
            : undefined,
        })),
      );
  }

  deleteItem(key: KeyFromIndex<TPrimary>, options?: Partial<DeleteItemInput>) {
    return this.#client
      .deleteItem({
        TableName: this.#name,
        Key: marshall(key),
        ...options,
      })
      .pipe(
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
    options?: Partial<QueryInput>,
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

  scan(options?: Partial<ScanInput>) {
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

  // Batch operations
  batchGetItem(
    keys: KeyFromIndex<TPrimary>[],
    options?: Partial<BatchGetItemInput>,
  ): Effect.Effect<BatchGetResult<ItemWithKeys<TPrimary>>, Error> {
    // DynamoDB batchGetItem has a limit of 100 keys
    if (keys.length > 100) {
      return Effect.fail(
        new Error('batchGetItem supports maximum 100 keys per request'),
      );
    }

    // Separate table-level options from request-level options
    const {
      ReturnConsumedCapacity,
      ...tableOptions
    } = options || {};

    const requestItems = {
      [this.#name]: {
        Keys: keys.map((key) => marshall(key)),
        ...tableOptions,
      },
    };

    return this.#client
      .batchGetItem({
        RequestItems: requestItems,
        ...(ReturnConsumedCapacity && { ReturnConsumedCapacity }),
      })
      .pipe(
        Effect.map((response) => {
          const tableResponse = response.Responses?.[this.#name] || [];
          const unprocessedKeys = response.UnprocessedKeys?.[this.#name];

          return {
            Items: tableResponse.map((item) =>
              unmarshall(item),
            ) as ItemWithKeys<TPrimary>[],
            UnprocessedKeys: unprocessedKeys
              ? ({
                  Keys: (unprocessedKeys.Keys ||
                    []) as KeyFromIndex<TPrimary>[],
                  ProjectionExpression: unprocessedKeys.ProjectionExpression as
                    | string
                    | undefined,
                  ExpressionAttributeNames:
                    unprocessedKeys.ExpressionAttributeNames as
                      | Record<string, string>
                      | undefined,
                } as
                  | {
                      Keys: KeyFromIndex<any>[];
                      ProjectionExpression?: string | undefined;
                      ExpressionAttributeNames?:
                        | Record<string, string>
                        | undefined;
                    }
                  | undefined)
              : undefined,
            ConsumedCapacity: response.ConsumedCapacity as
              | ConsumedCapacity[]
              | undefined,
          };
        }),
      );
  }

  batchWriteItem(
    requests: BatchWriteRequest<TPrimary, TGSIs, TLSIs>,
    options?: Partial<BatchWriteItemInput>,
  ): Effect.Effect<BatchWriteResult, Error> {
    const totalRequests =
      (requests.putRequests?.length || 0) +
      (requests.deleteRequests?.length || 0);

    // DynamoDB doesn't allow empty batch write requests
    if (totalRequests === 0) {
      return Effect.fail(
        new Error('batchWriteItem requires at least one put or delete request'),
      );
    }

    // DynamoDB batchWriteItem has a limit of 25 operations per request
    if (totalRequests > 25) {
      return Effect.fail(
        new Error('batchWriteItem supports maximum 25 operations per request'),
      );
    }

    const writeRequests: any[] = [];

    // Add put requests
    if (requests.putRequests) {
      writeRequests.push(
        ...requests.putRequests.map((item) => ({
          PutRequest: { Item: marshall(item) },
        })),
      );
    }

    // Add delete requests
    if (requests.deleteRequests) {
      writeRequests.push(
        ...requests.deleteRequests.map((key) => ({
          DeleteRequest: { Key: marshall(key) },
        })),
      );
    }

    const requestItems = {
      [this.#name]: writeRequests,
    };

    return this.#client
      .batchWriteItem({
        RequestItems: requestItems,
        ...options,
      })
      .pipe(
        Effect.map((response) => {
          const unprocessedItems = response.UnprocessedItems?.[this.#name];

          return {
            UnprocessedItems: unprocessedItems
              ? ({
                  PutRequest: unprocessedItems
                    .filter((item: any) => item.PutRequest)
                    .map((item: any) => item.PutRequest.Item) as
                    | Record<string, unknown>[]
                    | undefined,
                  DeleteRequest: unprocessedItems
                    .filter((item: any) => item.DeleteRequest)
                    .map((item: any) => item.DeleteRequest) as
                    | { Key: Record<string, unknown> }[]
                    | undefined,
                } as
                  | {
                      PutRequest?: Record<string, unknown>[] | undefined;
                      DeleteRequest?:
                        | { Key: Record<string, unknown> }[]
                        | undefined;
                    }
                  | undefined)
              : undefined,
            ItemCollectionMetrics: response.ItemCollectionMetrics as
              | Record<string, ItemCollectionMetrics[]>
              | undefined,
            ConsumedCapacity: response.ConsumedCapacity as
              | ConsumedCapacity[]
              | undefined,
          };
        }),
      );
  }

  // Transaction operations
  transactWriteItems(
    transactItems: TransactWriteItem<TPrimary, TGSIs, TLSIs>[],
    options?: Partial<TransactWriteItemsInput>,
  ): Effect.Effect<TransactWriteResult, Error> {
    // DynamoDB transactWriteItems has a limit of 25 operations per request
    if (transactItems.length > 25) {
      return Effect.fail(
        new Error(
          'transactWriteItems supports maximum 25 operations per request',
        ),
      );
    }

    if (transactItems.length === 0) {
      return Effect.fail(
        new Error('transactWriteItems requires at least one operation'),
      );
    }

    const transactWriteItems = transactItems.map((item) => {
      const writeItem: any = {};

      if (item.put) {
        writeItem.Put = {
          TableName: this.#name,
          Item: marshall(item.put.item),
          ...(item.put.conditionExpression && {
            ConditionExpression: item.put.conditionExpression,
          }),
          ...(item.put.expressionAttributeNames && {
            ExpressionAttributeNames: item.put.expressionAttributeNames,
          }),
          ...(item.put.expressionAttributeValues && {
            ExpressionAttributeValues: marshall(
              item.put.expressionAttributeValues,
            ),
          }),
          ...(item.put.returnValuesOnConditionCheckFailure && {
            ReturnValuesOnConditionCheckFailure:
              item.put.returnValuesOnConditionCheckFailure,
          }),
        };
      }

      if (item.update) {
        writeItem.Update = {
          TableName: this.#name,
          Key: marshall(item.update.key),
          UpdateExpression: item.update.updateExpression,
          ...(item.update.conditionExpression && {
            ConditionExpression: item.update.conditionExpression,
          }),
          ...(item.update.expressionAttributeNames && {
            ExpressionAttributeNames: item.update.expressionAttributeNames,
          }),
          ...(item.update.expressionAttributeValues && {
            ExpressionAttributeValues: marshall(
              item.update.expressionAttributeValues,
            ),
          }),
          ...(item.update.returnValuesOnConditionCheckFailure && {
            ReturnValuesOnConditionCheckFailure:
              item.update.returnValuesOnConditionCheckFailure,
          }),
        };
      }

      if (item.delete) {
        writeItem.Delete = {
          TableName: this.#name,
          Key: marshall(item.delete.key),
          ...(item.delete.conditionExpression && {
            ConditionExpression: item.delete.conditionExpression,
          }),
          ...(item.delete.expressionAttributeNames && {
            ExpressionAttributeNames: item.delete.expressionAttributeNames,
          }),
          ...(item.delete.expressionAttributeValues && {
            ExpressionAttributeValues: marshall(
              item.delete.expressionAttributeValues,
            ),
          }),
          ...(item.delete.returnValuesOnConditionCheckFailure && {
            ReturnValuesOnConditionCheckFailure:
              item.delete.returnValuesOnConditionCheckFailure,
          }),
        };
      }

      if (item.conditionCheck) {
        writeItem.ConditionCheck = {
          TableName: this.#name,
          Key: marshall(item.conditionCheck.key),
          ConditionExpression: item.conditionCheck.conditionExpression,
          ...(item.conditionCheck.expressionAttributeNames && {
            ExpressionAttributeNames:
              item.conditionCheck.expressionAttributeNames,
          }),
          ...(item.conditionCheck.expressionAttributeValues && {
            ExpressionAttributeValues: marshall(
              item.conditionCheck.expressionAttributeValues,
            ),
          }),
        };
      }

      return writeItem;
    });

    return this.#client
      .transactWriteItems({
        TransactItems: transactWriteItems,
        ...options,
      })
      .pipe(
        Effect.map((response) => ({
          ItemCollectionMetrics: response.ItemCollectionMetrics as
            | Record<string, ItemCollectionMetrics[]>
            | undefined,
          ConsumedCapacity: response.ConsumedCapacity as
            | ConsumedCapacity[]
            | undefined,
        })),
      );
  }

  transactGetItems(
    transactItems: TransactGetItem<TPrimary>[],
    options?: Partial<TransactGetItemsInput>,
  ): Effect.Effect<TransactGetResult<ItemWithKeys<TPrimary>>, Error> {
    // DynamoDB transactGetItems has a limit of 25 operations per request
    if (transactItems.length > 25) {
      return Effect.fail(
        new Error(
          'transactGetItems supports maximum 25 operations per request',
        ),
      );
    }

    if (transactItems.length === 0) {
      return Effect.fail(
        new Error('transactGetItems requires at least one operation'),
      );
    }

    const transactGetItems = transactItems.map((item) => ({
      Get: {
        TableName: this.#name,
        Key: marshall(item.key),
        ...(item.projectionExpression && {
          ProjectionExpression: item.projectionExpression,
        }),
        ...(item.expressionAttributeNames && {
          ExpressionAttributeNames: item.expressionAttributeNames,
        }),
      },
    }));

    return this.#client
      .transactGetItems({
        TransactItems: transactGetItems,
        ...options,
      })
      .pipe(
        Effect.map((response) => ({
          Items: (response.Responses || []).map((item) =>
            item.Item
              ? (unmarshall(item.Item) as ItemWithKeys<TPrimary>)
              : null,
          ),
          ConsumedCapacity: response.ConsumedCapacity as
            | ConsumedCapacity[]
            | undefined,
        })),
      );
  }

  // GSI operations
  gsi<TName extends keyof TGSIs>(indexName: TName) {
    return {
      query: (
        key: KeyConditionExprParameters<TGSIs[TName]>,
        options?: Partial<QueryInput>,
      ) => {
        return this.#queryExecutor
          .executeQuery(key, this.gsis[indexName], {
            ...options,
            IndexName: indexName as string,
          })
          .pipe(
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
      },

      scan: (options?: Partial<ScanInput>) => {
        return this.#queryExecutor
          .executeScan({
            ...options,
            IndexName: indexName as string,
          })
          .pipe(
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
      },
    };
  }

  // LSI operations
  lsi<TName extends keyof TLSIs>(indexName: TName) {
    type IndexDef = TLSIs[TName];

    return {
      query: (
        key: KeyConditionExprParameters<IndexDef>,
        options?: Partial<QueryInput>,
      ) => {
        return this.#queryExecutor
          .executeQuery(key, this.lsis[indexName], {
            ...options,
            IndexName: indexName as string,
          })
          .pipe(
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
      },

      scan: (options?: Partial<ScanInput>) => {
        return this.#queryExecutor
          .executeScan({
            ...options,
            IndexName: indexName as string,
          })
          .pipe(
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

  build(): DynamoTable<TPrimary, TGSIs, TLSIs> {
    return new DynamoTable({
      name: this.#name,
      primary: this.#primary,
      gsis: this.#gsis,
      lsis: this.#lsis,
      dynamoConfig: this.#dynamoConfig,
    });
  }
}
