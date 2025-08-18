/* eslint-disable ts/no-empty-object-type */
import type {
  ConsumedCapacity,
  ItemCollectionMetrics,
} from '@aws-sdk/client-dynamodb';
import type {
  BatchGetOptions,
  BatchGetResult,
  BatchWriteOptions,
  BatchWriteRequest,
  BatchWriteResult,
  DeleteItemOptions,
  DynamoConfig,
  EnhancedDeleteResult,
  EnhancedGetItemResult,
  EnhancedPutResult,
  EnhancedQueryResult,
  EnhancedScanResult,
  EnhancedUpdateResult,
  GetItemOptions,
  IndexDefinition,
  ItemForPut,
  ItemForUpdate,
  ItemWithKeys,
  KeyConditionExprParameters,
  KeyFromIndex,
  PutItemOptions,
  QueryOptions,
  ScanOptions,
  SecondaryIndexDefinition,
  Simplify,
  TransactGetItem,
  TransactGetOptions,
  TransactGetResult,
  TransactWriteItem,
  TransactWriteOptions,
  TransactWriteResult,
  UpdateOptions,
} from './types.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactGetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Effect } from 'effect';
import { DynamoQueryExecutor } from './query-executor.js';

export class DynamoTable<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, SecondaryIndexDefinition> = {},
  TLSIs extends Record<string, SecondaryIndexDefinition> = {},
> {
  readonly #name: string;
  readonly #client: DynamoDBDocumentClient;
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

    const client = new DynamoDBClient({
      region: config.dynamoConfig.region || 'us-east-1',
      credentials: {
        accessKeyId: config.dynamoConfig.accessKey,
        secretAccessKey: config.dynamoConfig.secretKey,
      },
      ...(config.dynamoConfig.endpoint && {
        endpoint: config.dynamoConfig.endpoint,
      }),
    });
    this.#client = DynamoDBDocumentClient.from(client);
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
    options?: GetItemOptions,
  ): Effect.Effect<EnhancedGetItemResult<ItemWithKeys<TPrimary>>> {
    return Effect.promise(() =>
      this.#client.send(
        new GetCommand({
          TableName: this.#name,
          Key: key,
          ConsistentRead: options?.consistentRead,
          ProjectionExpression: options?.projectionExpression,
          ExpressionAttributeNames: options?.expressionAttributeNames,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Item: (response.Item as ItemWithKeys<TPrimary>) || null,
        ConsumedCapacity: response.ConsumedCapacity,
      })),
    );
  }

  putItem(
    item: ItemForPut<TPrimary, TGSIs, TLSIs>,
    options?: PutItemOptions,
  ): Effect.Effect<EnhancedPutResult> {
    return Effect.promise(() =>
      this.#client.send(
        new PutCommand({
          TableName: this.#name,
          Item: item,
          ReturnValues: options?.returnValue,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
          ReturnItemCollectionMetrics: options?.returnItemCollectionMetrics,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Attributes: response.Attributes,
        ConsumedCapacity: response.ConsumedCapacity,
        ItemCollectionMetrics: response.ItemCollectionMetrics,
      })),
    );
  }

  updateItem(
    key: KeyFromIndex<TPrimary>,
    updates: ItemForUpdate<TPrimary, TGSIs, TLSIs>,
    options?: UpdateOptions,
  ): Effect.Effect<EnhancedUpdateResult<ItemWithKeys<TPrimary>>> {
    const updateExpression =
      options?.updateExpression || this.#buildUpdateExpression(updates);
    const expressionAttributeNames =
      options?.expressionAttributeNames || this.#buildAttributeNames(updates);
    const expressionAttributeValues =
      options?.expressionAttributeValues || this.#buildAttributeValues(updates);
    const ReturnValues = options?.returnValue || 'ALL_NEW';

    return Effect.promise(() =>
      this.#client.send(
        new UpdateCommand({
          TableName: this.#name,
          Key: key,
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
          ReturnItemCollectionMetrics: options?.returnItemCollectionMetrics,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Attributes: response.Attributes as ItemWithKeys<TPrimary>,
        ConsumedCapacity: response.ConsumedCapacity,
        ItemCollectionMetrics: response.ItemCollectionMetrics,
      })),
    );
  }

  deleteItem(
    key: KeyFromIndex<TPrimary>,
    options?: DeleteItemOptions,
  ): Effect.Effect<EnhancedDeleteResult> {
    return Effect.promise(() =>
      this.#client.send(
        new DeleteCommand({
          TableName: this.#name,
          Key: key,
          ReturnValues: options?.returnValue,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
          ReturnItemCollectionMetrics: options?.returnItemCollectionMetrics,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Attributes: response.Attributes,
        ConsumedCapacity: response.ConsumedCapacity,
        ItemCollectionMetrics: response.ItemCollectionMetrics,
      })),
    );
  }

  query(
    key: KeyConditionExprParameters<TPrimary>,
    options?: QueryOptions,
  ): Effect.Effect<EnhancedQueryResult<ItemWithKeys<TPrimary>>> {
    return this.#queryExecutor.executeQuery(key, this.primary, options);
  }

  scan(
    options?: ScanOptions,
  ): Effect.Effect<EnhancedScanResult<ItemWithKeys<TPrimary>>> {
    return this.#queryExecutor.executeScan(options);
  }

  // Batch operations
  batchGetItem(
    keys: KeyFromIndex<TPrimary>[],
    options?: BatchGetOptions,
  ): Effect.Effect<BatchGetResult<ItemWithKeys<TPrimary>>, Error> {
    // DynamoDB batchGetItem has a limit of 100 keys
    if (keys.length > 100) {
      return Effect.fail(
        new Error('batchGetItem supports maximum 100 keys per request'),
      );
    }

    const requestItems = {
      [this.#name]: {
        Keys: keys,
        ...(options?.consistentRead && {
          ConsistentRead: options.consistentRead,
        }),
        ...(options?.projectionExpression && {
          ProjectionExpression: options.projectionExpression,
        }),
        ...(options?.expressionAttributeNames && {
          ExpressionAttributeNames: options.expressionAttributeNames,
        }),
      },
    };

    return Effect.promise(() =>
      this.#client.send(
        new BatchGetCommand({
          RequestItems: requestItems,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
        }),
      ),
    ).pipe(
      Effect.map((response) => {
        const tableResponse = response.Responses?.[this.#name] || [];
        const unprocessedKeys = response.UnprocessedKeys?.[this.#name];

        return {
          Items: tableResponse as ItemWithKeys<TPrimary>[],
          UnprocessedKeys: unprocessedKeys
            ? ({
                Keys: (unprocessedKeys.Keys || []) as KeyFromIndex<TPrimary>[],
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
    options?: BatchWriteOptions,
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
          PutRequest: { Item: item },
        })),
      );
    }

    // Add delete requests
    if (requests.deleteRequests) {
      writeRequests.push(
        ...requests.deleteRequests.map((key) => ({
          DeleteRequest: { Key: key },
        })),
      );
    }

    const requestItems = {
      [this.#name]: writeRequests,
    };

    return Effect.promise(() =>
      this.#client.send(
        new BatchWriteCommand({
          RequestItems: requestItems,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
          ReturnItemCollectionMetrics: options?.returnItemCollectionMetrics,
        }),
      ),
    ).pipe(
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
    options?: TransactWriteOptions,
  ): Effect.Effect<TransactWriteResult, Error> {
    // DynamoDB transactWriteItems has a limit of 25 operations per request
    if (transactItems.length > 25) {
      return Effect.fail(
        new Error('transactWriteItems supports maximum 25 operations per request'),
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
          Item: item.put.item,
          ...(item.put.conditionExpression && {
            ConditionExpression: item.put.conditionExpression,
          }),
          ...(item.put.expressionAttributeNames && {
            ExpressionAttributeNames: item.put.expressionAttributeNames,
          }),
          ...(item.put.expressionAttributeValues && {
            ExpressionAttributeValues: item.put.expressionAttributeValues,
          }),
          ...(item.put.returnValuesOnConditionCheckFailure && {
            ReturnValuesOnConditionCheckFailure: item.put.returnValuesOnConditionCheckFailure,
          }),
        };
      }

      if (item.update) {
        writeItem.Update = {
          TableName: this.#name,
          Key: item.update.key,
          UpdateExpression: item.update.updateExpression,
          ...(item.update.conditionExpression && {
            ConditionExpression: item.update.conditionExpression,
          }),
          ...(item.update.expressionAttributeNames && {
            ExpressionAttributeNames: item.update.expressionAttributeNames,
          }),
          ...(item.update.expressionAttributeValues && {
            ExpressionAttributeValues: item.update.expressionAttributeValues,
          }),
          ...(item.update.returnValuesOnConditionCheckFailure && {
            ReturnValuesOnConditionCheckFailure: item.update.returnValuesOnConditionCheckFailure,
          }),
        };
      }

      if (item.delete) {
        writeItem.Delete = {
          TableName: this.#name,
          Key: item.delete.key,
          ...(item.delete.conditionExpression && {
            ConditionExpression: item.delete.conditionExpression,
          }),
          ...(item.delete.expressionAttributeNames && {
            ExpressionAttributeNames: item.delete.expressionAttributeNames,
          }),
          ...(item.delete.expressionAttributeValues && {
            ExpressionAttributeValues: item.delete.expressionAttributeValues,
          }),
          ...(item.delete.returnValuesOnConditionCheckFailure && {
            ReturnValuesOnConditionCheckFailure: item.delete.returnValuesOnConditionCheckFailure,
          }),
        };
      }

      if (item.conditionCheck) {
        writeItem.ConditionCheck = {
          TableName: this.#name,
          Key: item.conditionCheck.key,
          ConditionExpression: item.conditionCheck.conditionExpression,
          ...(item.conditionCheck.expressionAttributeNames && {
            ExpressionAttributeNames: item.conditionCheck.expressionAttributeNames,
          }),
          ...(item.conditionCheck.expressionAttributeValues && {
            ExpressionAttributeValues: item.conditionCheck.expressionAttributeValues,
          }),
        };
      }

      return writeItem;
    });

    return Effect.promise(() =>
      this.#client.send(
        new TransactWriteCommand({
          TransactItems: transactWriteItems,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
          ReturnItemCollectionMetrics: options?.returnItemCollectionMetrics,
          ...(options?.clientRequestToken && {
            ClientRequestToken: options.clientRequestToken,
          }),
        }),
      ),
    ).pipe(
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
    options?: TransactGetOptions,
  ): Effect.Effect<TransactGetResult<ItemWithKeys<TPrimary>>, Error> {
    // DynamoDB transactGetItems has a limit of 25 operations per request
    if (transactItems.length > 25) {
      return Effect.fail(
        new Error('transactGetItems supports maximum 25 operations per request'),
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
        Key: item.key,
        ...(item.projectionExpression && {
          ProjectionExpression: item.projectionExpression,
        }),
        ...(item.expressionAttributeNames && {
          ExpressionAttributeNames: item.expressionAttributeNames,
        }),
      },
    }));

    return Effect.promise(() =>
      this.#client.send(
        new TransactGetCommand({
          TransactItems: transactGetItems,
          ReturnConsumedCapacity: options?.returnConsumedCapacity,
        }),
      ),
    ).pipe(
      Effect.map((response) => ({
        Items: (response.Responses || []).map(
          (item) => (item.Item as ItemWithKeys<TPrimary>) || null,
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
        options?: QueryOptions,
      ): Effect.Effect<EnhancedQueryResult<ItemWithKeys<TPrimary>>> => {
        return this.#queryExecutor.executeQuery(key, this.gsis[indexName], {
          ...options,
          indexName: indexName as string,
        });
      },

      scan: (
        options?: ScanOptions,
      ): Effect.Effect<EnhancedScanResult<ItemWithKeys<TPrimary>>> => {
        return this.#queryExecutor.executeScan({
          ...options,
          indexName: indexName as string,
        });
      },
    };
  }

  // LSI operations
  lsi<TName extends keyof TLSIs>(indexName: TName) {
    type IndexDef = TLSIs[TName];

    return {
      query: (
        key: KeyConditionExprParameters<IndexDef>,
        options?: QueryOptions,
      ): Effect.Effect<EnhancedQueryResult<ItemWithKeys<TPrimary>>> => {
        return this.#queryExecutor.executeQuery(key, this.lsis[indexName], {
          ...options,
          indexName: indexName as string,
        });
      },

      scan: (
        options?: ScanOptions,
      ): Effect.Effect<EnhancedScanResult<ItemWithKeys<TPrimary>>> => {
        return this.#queryExecutor.executeScan({
          ...options,
          indexName: indexName as string,
        });
      },
    };
  }

  // Helper methods for building DynamoDB expressions
  #buildUpdateExpression(updates: Record<string, unknown>): string {
    const setParts = Object.keys(updates).map((key) => `#${key} = :${key}`);
    return `SET ${setParts.join(', ')}`;
  }

  #buildAttributeNames(
    updates: Record<string, unknown>,
  ): Record<string, string> {
    const attributeNames: Record<string, string> = {};
    Object.keys(updates).forEach((key) => {
      attributeNames[`#${key}`] = key;
    });
    return attributeNames;
  }

  #buildAttributeValues(
    updates: Record<string, unknown>,
  ): Record<string, unknown> {
    const attributeValues: Record<string, unknown> = {};
    Object.entries(updates).forEach(([key, value]) => {
      attributeValues[`:${key}`] = value;
    });
    return attributeValues;
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
