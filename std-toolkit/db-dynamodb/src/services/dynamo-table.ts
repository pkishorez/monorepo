import { Effect } from 'effect';
import { createDynamoDB, type DynamoDBClient } from './dynamo-client.js';
import { DynamodbError } from '../errors.js';
import type {
  DynamoTableConfig,
  IndexDefinition,
  MarshalledOutput,
  TransactItem,
  TransactItemBase,
} from '../types/index.js';
import type { CreateTableInput } from '../generated/types.js';
import { marshall, unmarshall } from '../internal/marshall.js';
import {
  keyConditionExpr,
  type KeyConditionExprParameters,
} from '../expr/key-condition.js';
import { buildExpr } from '../expr/build-expr.js';
import { type ConditionOperation } from '../expr/condition.js';

/**
 * Result of a DynamoDB query or scan operation.
 */
export interface QueryResult {
  /** Array of unmarshalled items returned by the query */
  Items: Record<string, unknown>[];
  /** Pagination token for retrieving the next page of results */
  LastEvaluatedKey?: Record<string, unknown>;
}

/**
 * A DynamoDB table with type-safe index configuration and CRUD operations.
 *
 * @typeParam TPrimaryIndex - The primary index definition type
 * @typeParam TSecondaryIndexMap - Map of secondary index names to their definitions
 */
export class DynamoTable<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  readonly tableName: string;
  readonly primary: TPrimaryIndex;
  readonly secondaryIndexMap: TSecondaryIndexMap;
  #client: DynamoDBClient;

  constructor(
    config: DynamoTableConfig,
    primary: TPrimaryIndex,
    secondaryIndexMap: TSecondaryIndexMap,
    client: DynamoDBClient,
  ) {
    this.tableName = config.tableName;
    this.primary = primary;
    this.secondaryIndexMap = secondaryIndexMap;
    this.#client = client;
  }

  /**
   * Creates a new DynamoDB table builder with the given configuration.
   *
   * @param config - The table configuration including name, region, and credentials
   * @returns A builder to configure the primary key
   */
  static make(config: DynamoTableConfig) {
    return {
      /**
       * Defines the primary key structure for the table.
       *
       * @typeParam Pk - The partition key attribute name
       * @typeParam Sk - The sort key attribute name
       * @param pk - Partition key attribute name
       * @param sk - Sort key attribute name
       * @returns A builder to add secondary indexes
       */
      primary<Pk extends string, Sk extends string>(pk: Pk, sk: Sk) {
        return new DynamoTableBuilder(config, { pk, sk }, {});
      },
    };
  }

  #rawQuery(
    indexDef: IndexDefinition,
    cond: KeyConditionExprParameters,
    options?: {
      IndexName?: string;
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamodbError> {
    const exprResult = buildExpr({
      keyCondition: keyConditionExpr(indexDef, cond),
      filter: options?.filter,
    });

    const queryOptions: Record<string, unknown> = {
      TableName: this.tableName,
      ...exprResult,
    };

    if (options?.IndexName) queryOptions.IndexName = options.IndexName;
    if (options?.Limit !== undefined) queryOptions.Limit = options.Limit;
    if (options?.ScanIndexForward !== undefined)
      queryOptions.ScanIndexForward = options.ScanIndexForward;

    return this.#client.query(queryOptions).pipe(
      Effect.map((response: any) => {
        const result: QueryResult = {
          Items: response.Items?.map(unmarshall) ?? [],
        };
        if (response.LastEvaluatedKey) {
          result.LastEvaluatedKey = unmarshall(response.LastEvaluatedKey);
        }
        return result;
      }),
      Effect.mapError(DynamodbError.queryFailed),
    );
  }

  #rawScan(options?: {
    IndexName?: string;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
  }): Effect.Effect<QueryResult, DynamodbError> {
    const scanOptions: Record<string, unknown> = {
      TableName: this.tableName,
    };
    if (options?.IndexName) scanOptions.IndexName = options.IndexName;
    if (options?.Limit !== undefined) scanOptions.Limit = options.Limit;
    if (options?.ExclusiveStartKey)
      scanOptions.ExclusiveStartKey = marshall(options.ExclusiveStartKey);

    return this.#client.scan(scanOptions).pipe(
      Effect.map((response: any) => {
        const result: QueryResult = {
          Items: response.Items?.map(unmarshall) ?? [],
        };
        if (response.LastEvaluatedKey) {
          result.LastEvaluatedKey = unmarshall(response.LastEvaluatedKey);
        }
        return result;
      }),
      Effect.mapError(DynamodbError.scanFailed),
    );
  }

  #rawDeleteItem(key: IndexDefinition): Effect.Effect<void, DynamodbError> {
    return this.#client
      .deleteItem({
        TableName: this.tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
      })
      .pipe(
        Effect.map(() => undefined),
        Effect.mapError(DynamodbError.deleteItemFailed),
      );
  }

  /**
   * Retrieves a single item by its primary key.
   *
   * @param key - The primary key values (pk and sk)
   * @param options - Optional read options
   * @returns The item if found, or null
   */
  getItem(
    key: IndexDefinition,
    options?: { ConsistentRead?: boolean },
  ): Effect.Effect<{ Item: Record<string, unknown> | null }, DynamodbError> {
    return this.#client
      .getItem({
        TableName: this.tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
        ConsistentRead: options?.ConsistentRead,
      })
      .pipe(
        Effect.map((response: any) => ({
          Item: response.Item ? unmarshall(response.Item) : null,
        })),
        Effect.mapError(DynamodbError.getItemFailed),
      );
  }

  /**
   * Creates or replaces an item in the table.
   *
   * @param value - The item to put
   * @param options - Optional condition expression and return values
   * @returns The old item attributes if ReturnValues is ALL_OLD
   */
  putItem(
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: 'ALL_OLD';
    },
  ): Effect.Effect<
    { Attributes: Record<string, unknown> | null },
    DynamodbError
  > {
    return this.#client
      .putItem({
        TableName: this.tableName,
        Item: marshall(value),
        ...options,
      })
      .pipe(
        Effect.map((response: any) => ({
          Attributes: response.Attributes
            ? unmarshall(response.Attributes)
            : null,
        })),
        Effect.mapError(DynamodbError.putItemFailed),
      );
  }

  /**
   * Updates attributes of an existing item.
   *
   * @param key - The primary key of the item to update
   * @param options - Update expression and optional condition
   * @returns The updated item attributes
   */
  updateItem(
    key: IndexDefinition,
    options: {
      UpdateExpression?: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: 'ALL_NEW' | 'ALL_OLD';
    },
  ): Effect.Effect<
    { Attributes: Record<string, unknown> | null },
    DynamodbError
  > {
    return this.#client
      .updateItem({
        TableName: this.tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
        ...options,
      })
      .pipe(
        Effect.map((response: any) => ({
          Attributes: response.Attributes
            ? unmarshall(response.Attributes)
            : null,
        })),
        Effect.mapError(DynamodbError.updateItemFailed),
      );
  }

  /**
   * Deletes an item from the table.
   *
   * @param key - The primary key of the item to delete
   */
  deleteItem(key: IndexDefinition): Effect.Effect<void, DynamodbError> {
    return this.#rawDeleteItem(key);
  }

  /**
   * Queries items using the primary index.
   *
   * @param cond - Key condition parameters
   * @param options - Query options including limit, sort order, and filter
   * @returns The query result with items and optional pagination token
   */
  query(
    cond: KeyConditionExprParameters,
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamodbError> {
    return this.#rawQuery(this.primary, cond, options);
  }

  /**
   * Scans all items in the table.
   *
   * @param options - Scan options including limit
   * @returns The scan result with items and optional pagination token
   */
  scan(options?: {
    Limit?: number;
  }): Effect.Effect<QueryResult, DynamodbError> {
    return this.#rawScan(options);
  }

  /**
   * Accesses a secondary index for querying.
   *
   * @typeParam IndexName - The name of the secondary index
   * @param indexName - The secondary index name
   * @returns An object with query and scan methods for the index
   */
  index<IndexName extends keyof TSecondaryIndexMap>(indexName: IndexName) {
    const self = this;
    const indexDef = this.secondaryIndexMap[indexName as string];
    if (!indexDef) {
      throw new Error(`Index ${String(indexName)} not found`);
    }
    return {
      /**
       * Queries items using the secondary index.
       */
      query(
        cond: KeyConditionExprParameters,
        options?: {
          Limit?: number;
          ScanIndexForward?: boolean;
          filter?: ConditionOperation;
        },
      ): Effect.Effect<QueryResult, DynamodbError> {
        return self.#rawQuery(indexDef, cond, {
          ...options,
          IndexName: indexName as string,
        });
      },
      /**
       * Scans all items in the secondary index.
       */
      scan(options?: {
        Limit?: number;
      }): Effect.Effect<QueryResult, DynamodbError> {
        return self.#rawScan({
          ...options,
          IndexName: indexName as string,
        });
      },
    };
  }

  /**
   * Creates a put operation for use in a transaction.
   *
   * @param value - The item to put
   * @param options - Optional condition expression
   * @returns A transaction item for put
   */
  opPutItem(
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
    },
  ): TransactItemBase {
    return {
      kind: 'put',
      options: {
        TableName: this.tableName,
        Item: marshall(value),
        ...options,
      },
    };
  }

  /**
   * Creates an update operation for use in a transaction.
   *
   * @param key - The primary key of the item to update
   * @param options - Update expression and optional condition
   * @returns A transaction item for update
   */
  opUpdateItem(
    key: IndexDefinition,
    options: {
      UpdateExpression: string;
      ConditionExpression?: string | undefined;
      ExpressionAttributeNames?: Record<string, string> | undefined;
      ExpressionAttributeValues?: MarshalledOutput | undefined;
    },
  ): TransactItemBase {
    return {
      kind: 'update',
      options: {
        TableName: this.tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
        ...options,
      },
    };
  }

  /**
   * Executes a transaction with multiple put and update operations.
   *
   * @param items - Array of transaction items
   * @returns Effect that completes when the transaction succeeds
   */
  transact(
    items: (TransactItem | TransactItemBase)[],
  ): Effect.Effect<void, DynamodbError> {
    return this.#client
      .transactWriteItems({
        TransactItems: items.map((item) =>
          item.kind === 'put'
            ? { Put: item.options }
            : { Update: item.options },
        ),
      })
      .pipe(
        Effect.map(() => undefined),
        Effect.mapError(DynamodbError.transactionFailed),
      );
  }

  /**
   * Deletes all items from the table. Scans and deletes in a loop.
   *
   * @param confirmation - Must be exactly "I KNOW WHAT I AM DOING."
   */
  dangerouslyPurgeAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<void, DynamodbError> {
    if (confirmation !== 'I KNOW WHAT I AM DOING') {
      return Effect.fail(
        DynamodbError.validationException({ statusCode: 400 }),
      );
    }

    return Effect.gen(this, function* () {
      let lastKey: Record<string, unknown> | undefined;

      do {
        const result = yield* this.#rawScan(
          lastKey ? { ExclusiveStartKey: lastKey } : undefined,
        );

        if (result.Items.length > 0) {
          yield* Effect.all(
            result.Items.map((item) =>
              this.#rawDeleteItem({
                pk: item[this.primary.pk] as string,
                sk: item[this.primary.sk] as string,
              }),
            ),
            { concurrency: 25 },
          );
        }

        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
    });
  }

  /**
   * Gets the table schema configuration for creating the table.
   * Includes key schema, attribute definitions, and secondary indexes.
   *
   * @returns The table schema without the TableName field
   */
  getTableSchema(): Omit<CreateTableInput, 'TableName'> {
    const allSecondaryKeys = Object.entries(this.secondaryIndexMap).map(
      ([IndexName, { pk, sk }]) => ({ IndexName, pk, sk }),
    );

    const globalSecondaryIndexes = allSecondaryKeys
      .filter((v) => v.pk !== this.primary.pk)
      .map(({ IndexName, pk, sk }) => ({
        IndexName,
        KeySchema: [
          { AttributeName: pk, KeyType: 'HASH' as const },
          { AttributeName: sk, KeyType: 'RANGE' as const },
        ],
        Projection: { ProjectionType: 'ALL' as const },
      }));

    const localSecondaryIndexes = allSecondaryKeys
      .filter((v) => v.pk === this.primary.pk)
      .map(({ IndexName, sk }) => ({
        IndexName,
        KeySchema: [
          { AttributeName: this.primary.pk, KeyType: 'HASH' as const },
          { AttributeName: sk, KeyType: 'RANGE' as const },
        ],
        Projection: { ProjectionType: 'ALL' as const },
      }));

    return {
      KeySchema: [
        { AttributeName: this.primary.pk, KeyType: 'HASH' },
        { AttributeName: this.primary.sk, KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: this.primary.pk, AttributeType: 'S' },
        { AttributeName: this.primary.sk, AttributeType: 'S' },
        ...allSecondaryKeys.flatMap((v) => [
          { AttributeName: v.pk, AttributeType: 'S' as const },
          { AttributeName: v.sk, AttributeType: 'S' as const },
        ]),
      ],
      ...(globalSecondaryIndexes.length > 0 && {
        GlobalSecondaryIndexes: globalSecondaryIndexes,
      }),
      ...(localSecondaryIndexes.length > 0 && {
        LocalSecondaryIndexes: localSecondaryIndexes,
      }),
      BillingMode: 'PAY_PER_REQUEST',
    };
  }
}

/**
 * Builder class for configuring DynamoDB table indexes.
 */
class DynamoTableBuilder<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  #config: DynamoTableConfig;
  #primary: TPrimaryIndex;
  #secondaryIndexMap: TSecondaryIndexMap;

  constructor(
    config: DynamoTableConfig,
    primary: TPrimaryIndex,
    secondaryIndexMap: TSecondaryIndexMap,
  ) {
    this.#config = config;
    this.#primary = primary;
    this.#secondaryIndexMap = secondaryIndexMap;
  }

  /**
   * Adds a local secondary index to the table.
   * Local secondary indexes share the partition key with the primary index.
   *
   * @typeParam IndexName - The name for the LSI
   * @typeParam Sk - The sort key attribute name for the LSI
   * @param name - The index name
   * @param sk - The sort key attribute name
   * @returns A builder with the LSI added
   */
  lsi<IndexName extends string, Sk extends string>(name: IndexName, sk: Sk) {
    return new DynamoTableBuilder<
      TPrimaryIndex,
      TSecondaryIndexMap &
        Record<IndexName, { pk: TPrimaryIndex['pk']; sk: Sk }>
    >(this.#config, this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk: this.#primary.pk, sk },
    } as TSecondaryIndexMap &
      Record<IndexName, { pk: TPrimaryIndex['pk']; sk: Sk }>);
  }

  /**
   * Adds a global secondary index to the table.
   * Global secondary indexes can have different partition and sort keys.
   *
   * @typeParam IndexName - The name for the GSI
   * @typeParam Pk - The partition key attribute name for the GSI
   * @typeParam Sk - The sort key attribute name for the GSI
   * @param name - The index name
   * @param pk - The partition key attribute name
   * @param sk - The sort key attribute name
   * @returns A builder with the GSI added
   */
  gsi<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ) {
    return new DynamoTableBuilder<
      TPrimaryIndex,
      TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
    >(this.#config, this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk, sk },
    } as TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>);
  }

  /**
   * Builds the final DynamoTable instance with all configured indexes.
   *
   * @returns The configured DynamoTable
   */
  build(): DynamoTable<TPrimaryIndex, TSecondaryIndexMap> {
    const client = createDynamoDB(this.#config);
    return new DynamoTable(
      this.#config,
      this.#primary,
      this.#secondaryIndexMap,
      client,
    );
  }
}
