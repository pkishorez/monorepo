import { Effect, Option } from 'effect';

import { DynamoDB } from '../dynamodb/index.js';
import { DynamoDBError } from '../../domain/dynamodb-error/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../../eschema/index.js';
import {
  Broadcaster,
  nextUlid,
  type EntityType,
} from '../../../../core/index.js';
import { makeDynamoEntity } from '../dynamo-entity/index.js';
import {
  makeDynamoSingleEntity,
  type SingleEntityDefaultBuilder,
} from '../dynamo-single-entity/index.js';
import type {
  IndexDefinition,
  MarshalledOutput,
  TransactItem,
  TransactWrite,
} from '../../types/index.js';
import type { CreateTableInput } from '../../clients/dynamodb-client/index.js';
import { marshall, unmarshall } from '../../domain/attribute-value/index.js';
import { buildExpr } from '../../domain/expression/index.js';
import {
  keyConditionExpr,
  type ConditionOperation,
  type KeyConditionExprParameters,
} from '../../domain/expression/index.js';
import type { TableSnapshot } from '../../../../snapshot/index.js';
import {
  createEntityRegistry,
  createTableSnapshot,
} from '../../../../snapshot/table-adapter/index.js';
import {
  tableIdentityTypeId,
  type TableIdentity,
} from '../../domain/table-identity/index.js';

interface CancellationReason {
  readonly Code?: string;
  readonly Message?: string;
}

const mapTransactionError = (
  cause: unknown,
  items: ReadonlyArray<TransactItem>,
  writes: ReadonlyArray<TransactWrite>,
): DynamoDBError => {
  const cancellation = cause as {
    readonly CancellationReasons?: unknown;
    readonly cancellationReasons?: unknown;
  };
  const reasons =
    cancellation.CancellationReasons ?? cancellation.cancellationReasons;
  if (Array.isArray(reasons)) {
    const failures = reasons.flatMap((reason, index) => {
      const { Code: reasonCode, Message: message } =
        reason as CancellationReason;
      const item = items[index];
      const write = writes[index];
      if (!reasonCode || reasonCode === 'None' || !item || !write) return [];
      return [
        {
          index,
          entityName: item.entityName,
          operationKind: item.operationKind,
          writeKind: write.kind,
          reasonCode,
          ...(message ? { message } : {}),
        },
      ];
    });

    if (
      failures.some(
        ({ reasonCode }) =>
          reasonCode === 'ConditionalCheckFailed' ||
          reasonCode === 'TransactionConflict',
      )
    ) {
      return DynamoDBError.conditionFailed(cause, failures);
    }
  }

  return DynamoDBError.transactionFailed(cause);
};

/**
 * Result of a DynamoDB query or scan operation.
 */
export interface QueryResult {
  /** Array of unmarshalled items returned by the query */
  Items: Record<string, unknown>[];
  /** Pagination token for retrieving the next page of results */
  LastEvaluatedKey?: Record<string, unknown>;
}

export interface TableIndexDescription {
  indexName: string;
  indexStatus?: string;
  estimatedItemCount?: number;
  indexSizeBytes?: number;
}

export interface TableDescription {
  tableName: string;
  tableStatus?: string;
  estimatedItemCount?: number;
  tableSizeBytes?: number;
  indexes: TableIndexDescription[];
}

interface TableScanOptions {
  Limit?: number;
  ExclusiveStartKey?: Record<string, unknown>;
  Segment?: number;
  TotalSegments?: number;
  ConsistentRead?: boolean;
}

type IndexScanOptions = Omit<TableScanOptions, 'ConsistentRead'>;

/**
 * A DynamoDB table with type-safe index configuration and CRUD operations.
 *
 * @typeParam TPrimaryIndex - The primary index definition type
 * @typeParam TSecondaryIndexMap - Map of secondary index names to their definitions
 */
export class DynamoTable<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> implements TableIdentity {
  readonly logicalName: string;
  readonly [tableIdentityTypeId] = {};
  readonly primary: TPrimaryIndex;
  readonly secondaryIndexMap: TSecondaryIndexMap;
  #entities = createEntityRegistry();

  constructor(
    logicalName: string,
    primary: TPrimaryIndex,
    secondaryIndexMap: TSecondaryIndexMap,
  ) {
    this.logicalName = logicalName;
    this.primary = primary;
    this.secondaryIndexMap = secondaryIndexMap;
  }

  #indexKind(index: IndexDefinition): 'gsi' | 'lsi' {
    return index.kind ?? (index.pk === this.primary.pk ? 'lsi' : 'gsi');
  }

  /** Returns the normalized logical storage contract for this table. */
  snapshot(): TableSnapshot {
    return createTableSnapshot({
      adapter: 'dynamodb',
      logicalName: this.logicalName,
      primaryIndex: this.primary,
      secondaryIndexes: Object.entries(this.secondaryIndexMap).map(
        ([name, index]) => ({
          name,
          kind: this.#indexKind(index),
          pk: index.pk,
          sk: index.sk,
        }),
      ),
      entities: this.#entities.snapshotSources(),
    });
  }

  /**
   * Defines a keyed entity on this table from an ESchema.
   * The entity is registered into the table when `.build()` is called.
   *
   * @param eschema - The entity's ESchema
   * @returns A builder to configure the primary index derivation
   */
  entity<TS extends AnyEntityESchema>(eschema: TS) {
    return makeDynamoEntity<DynamoTable<TPrimaryIndex, TSecondaryIndexMap>>(
      this,
      this.#entities.register,
    ).eschema(eschema);
  }

  /**
   * Defines a singleton entity on this table from an ESchema.
   * The entity is registered into the table when `.default()` is called.
   *
   * @param eschema - The single entity's ESchema
   * @returns A builder to set the default value
   */
  singleEntity<TS extends AnyUnkeyedESchema>(
    eschema: TS,
  ): SingleEntityDefaultBuilder<
    DynamoTable<TPrimaryIndex, TSecondaryIndexMap>,
    TS
  > {
    return makeDynamoSingleEntity<
      DynamoTable<TPrimaryIndex, TSecondaryIndexMap>
    >(this, this.#entities.register).eschema(eschema);
  }

  /**
   * Creates a new DynamoDB table builder.
   *
   * The table definition is pure topology (keys and indexes); the physical
   * The physical table name and client are supplied by {@link DynamoDB.layer}.
   *
   * @returns A builder to configure the primary key
   */
  static make(logicalName: string) {
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
        return new DynamoTableBuilder(logicalName, { pk, sk }, {});
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
  ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> {
    return this.#queryEffect(indexDef, cond, options);
  }

  #queryEffect(
    indexDef: IndexDefinition,
    cond: KeyConditionExprParameters,
    options?: {
      IndexName?: string;
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> {
    const exprResult = buildExpr({
      keyCondition: keyConditionExpr(indexDef, cond),
      filter: options?.filter,
    });

    const queryOptions: Record<string, unknown> = {
      ...exprResult,
    };

    if (options?.IndexName) queryOptions.IndexName = options.IndexName;
    if (options?.Limit !== undefined) queryOptions.Limit = options.Limit;
    if (options?.ScanIndexForward !== undefined)
      queryOptions.ScanIndexForward = options.ScanIndexForward;

    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client.query({ TableName: tableName, ...queryOptions }),
    ).pipe(
      Effect.map((response: any) => {
        const result: QueryResult = {
          Items: response.Items?.map(unmarshall) ?? [],
        };
        if (response.LastEvaluatedKey) {
          result.LastEvaluatedKey = unmarshall(response.LastEvaluatedKey);
        }
        return result;
      }),
      Effect.mapError(DynamoDBError.queryFailed),
    );
  }

  #rawScan(options?: {
    IndexName?: string;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
    Segment?: number;
    TotalSegments?: number;
    ConsistentRead?: boolean;
  }): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> {
    return this.#scanPage(options);
  }

  #scanPage(options?: {
    IndexName?: string;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
    Segment?: number;
    TotalSegments?: number;
    ConsistentRead?: boolean;
  }): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> {
    const scanOptions: Record<string, unknown> = {};
    if (options?.IndexName) scanOptions.IndexName = options.IndexName;
    if (options?.Limit !== undefined) scanOptions.Limit = options.Limit;
    if (options?.ExclusiveStartKey)
      scanOptions.ExclusiveStartKey = marshall(options.ExclusiveStartKey);
    if (options?.Segment !== undefined) scanOptions.Segment = options.Segment;
    if (options?.TotalSegments !== undefined)
      scanOptions.TotalSegments = options.TotalSegments;
    if (!options?.IndexName && options?.ConsistentRead !== undefined)
      scanOptions.ConsistentRead = options.ConsistentRead;

    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client.scan({ TableName: tableName, ...scanOptions }),
    ).pipe(
      Effect.map((response: any) => {
        const result: QueryResult = {
          Items: response.Items?.map(unmarshall) ?? [],
        };
        if (response.LastEvaluatedKey) {
          result.LastEvaluatedKey = unmarshall(response.LastEvaluatedKey);
        }
        return result;
      }),
      Effect.mapError(DynamoDBError.scanFailed),
    );
  }

  #rawDeleteItem(
    key: IndexDefinition,
  ): Effect.Effect<void, DynamoDBError, DynamoDB> {
    return this.#deleteStoredItem(key);
  }

  #deleteStoredItem(
    key: IndexDefinition,
  ): Effect.Effect<void, DynamoDBError, DynamoDB> {
    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client.deleteItem({
        TableName: tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
      }),
    ).pipe(
      Effect.map(() => undefined),
      Effect.mapError(DynamoDBError.deleteItemFailed),
    );
  }

  describe = (): Effect.Effect<TableDescription, DynamoDBError, DynamoDB> => {
    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client
        .describeTable({ TableName: tableName })
        .pipe(Effect.map((response: any) => ({ response, tableName }))),
    ).pipe(
      Effect.map(({ response, tableName }) => {
        const tableDescription = response.Table ?? {};
        const indexes = [
          ...(tableDescription.LocalSecondaryIndexes ?? []),
          ...(tableDescription.GlobalSecondaryIndexes ?? []),
        ].map((index: any) => ({
          indexName: index.IndexName,
          indexStatus: index.IndexStatus,
          estimatedItemCount: index.ItemCount,
          indexSizeBytes: index.IndexSizeBytes,
        }));

        return {
          tableName: tableDescription.TableName ?? tableName,
          tableStatus: tableDescription.TableStatus,
          estimatedItemCount: tableDescription.ItemCount,
          tableSizeBytes: tableDescription.TableSizeBytes,
          indexes,
        };
      }),
      Effect.mapError(DynamoDBError.describeFailed),
      Effect.withSpan('dynamodb.table.describe'),
    );
  };

  /**
   * Retrieves a single item by its primary key.
   *
   * @param key - The primary key values (pk and sk)
   * @param options - Optional read options
   * @returns The item if found, or null
   */
  getItem = (
    key: IndexDefinition,
    options?: { ConsistentRead?: boolean },
  ): Effect.Effect<
    { Item: Record<string, unknown> | null },
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client.getItem({
        TableName: tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
        ...(options?.ConsistentRead === undefined
          ? {}
          : { ConsistentRead: options.ConsistentRead }),
      }),
    ).pipe(
      Effect.map((response: any) => ({
        Item: response.Item ? unmarshall(response.Item) : null,
      })),
      Effect.mapError(DynamoDBError.getItemFailed),
    );
  };

  /**
   * Creates or replaces an item in the table.
   *
   * @param value - The item to put
   * @param options - Optional condition expression and return values
   * @returns The old item attributes if ReturnValues is ALL_OLD
   */
  putItem = (
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: 'ALL_OLD';
    },
  ): Effect.Effect<
    { Attributes: Record<string, unknown> | null },
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client.putItem({
        TableName: tableName,
        Item: marshall(value),
        ...options,
      }),
    ).pipe(
      Effect.map((response: any) => ({
        Attributes: response.Attributes
          ? unmarshall(response.Attributes)
          : null,
      })),
      Effect.mapError(DynamoDBError.putItemFailed),
    );
  };

  /**
   * Updates attributes of an existing item.
   *
   * @param key - The primary key of the item to update
   * @param options - Update expression and optional condition
   * @returns The updated item attributes
   */
  updateItem = (
    key: IndexDefinition,
    options: {
      UpdateExpression?: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: 'ALL_NEW' | 'ALL_OLD';
      ReturnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE';
    },
  ): Effect.Effect<
    { Attributes: Record<string, unknown> | null },
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
      client.updateItem({
        TableName: tableName,
        Key: marshall({
          [this.primary.pk]: key.pk,
          [this.primary.sk]: key.sk,
        }),
        ...options,
      }),
    ).pipe(
      Effect.map((response: any) => ({
        Attributes: response.Attributes
          ? unmarshall(response.Attributes)
          : null,
      })),
      Effect.mapError(DynamoDBError.updateItemFailed),
    );
  };

  /**
   * Deletes an item from the table.
   *
   * @param key - The primary key of the item to delete
   */
  deleteItem = (
    key: IndexDefinition,
  ): Effect.Effect<void, DynamoDBError, DynamoDB> => this.#rawDeleteItem(key);

  /**
   * Queries items using the primary index.
   *
   * @param cond - Key condition parameters
   * @param options - Query options including limit, sort order, and filter
   * @returns The query result with items and optional pagination token
   */
  query = (
    cond: KeyConditionExprParameters,
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> =>
    this.#rawQuery(this.primary, cond, options).pipe(
      Effect.withSpan('dynamodb.table.query'),
    );

  queryIndex = (
    indexName: string,
    cond: KeyConditionExprParameters,
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> =>
    Effect.suspend(() => {
      const indexDef = this.secondaryIndexMap[indexName];
      if (!indexDef) {
        return Effect.fail(
          DynamoDBError.queryFailed(`Index ${String(indexName)} not found`),
        );
      }
      return this.#queryEffect(indexDef, cond, {
        ...options,
        IndexName: indexName,
      });
    }).pipe(
      Effect.withSpan('dynamodb.table.query-index', {
        attributes: { index: String(indexName) },
      }),
    );

  /**
   * Scans all items in the table.
   *
   * @param options - Scan options including limit
   * @returns The scan result with items and optional pagination token
   */
  scan = (
    options?: TableScanOptions,
  ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> =>
    this.#rawScan(options).pipe(Effect.withSpan('dynamodb.table.scan'));

  /**
   * Accesses a secondary index for querying.
   *
   * @typeParam IndexName - The name of the secondary index
   * @param indexName - The secondary index name
   * @returns An object with query and scan methods for the index
   */
  index<IndexName extends keyof TSecondaryIndexMap>(indexName: IndexName) {
    const indexDef = this.secondaryIndexMap[indexName as string];
    if (!indexDef) {
      throw new Error(`Index ${String(indexName)} not found`);
    }
    const rawQuery = this.#rawQuery.bind(this);
    const rawScan = this.#rawScan.bind(this);
    return {
      /**
       * Queries items using the secondary index.
       */
      query: (
        cond: KeyConditionExprParameters,
        options?: {
          Limit?: number;
          ScanIndexForward?: boolean;
          filter?: ConditionOperation;
        },
      ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> =>
        rawQuery(indexDef, cond, {
          ...options,
          IndexName: indexName as string,
        }).pipe(
          Effect.withSpan('dynamodb.table.query-index', {
            attributes: { index: String(indexName) },
          }),
        ),
      /**
       * Scans all items in the secondary index.
       */
      scan: (
        options?: IndexScanOptions,
      ): Effect.Effect<QueryResult, DynamoDBError, DynamoDB> =>
        rawScan({
          ...options,
          IndexName: indexName as string,
        }).pipe(
          Effect.withSpan('dynamodb.table.scan-index', {
            attributes: { index: String(indexName) },
          }),
        ),
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
  ): TransactWrite {
    return {
      kind: 'put',
      options: {
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
  ): TransactWrite {
    return {
      kind: 'update',
      options: {
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
   * Every item must originate from this table instance — ops built against a
   * different table are rejected at runtime. Broadcasts entity changes after
   * a successful transaction.
   *
   * @param items - Array of transaction items produced by this table's entities
   * @returns The broadcast entities of the transaction
   */
  transact = (
    items: TransactItem[],
  ): Effect.Effect<EntityType<unknown>[], DynamoDBError, DynamoDB> => {
    return Effect.gen({ self: this }, function* () {
      if (items.length === 0) return [];

      for (const item of items) {
        if (item.table !== this) {
          return yield* Effect.fail(
            DynamoDBError.foreignTransactionItem(item.entityName),
          );
        }
      }

      const keyCounts = new Map<
        string,
        { count: number; pk: string; sk: string }
      >();
      for (const item of items) {
        const key = JSON.stringify([item.pk, item.sk]);
        const existing = keyCounts.get(key);
        keyCounts.set(key, {
          count: (existing?.count ?? 0) + 1,
          pk: item.pk,
          sk: item.sk,
        });
      }
      for (const { count, pk, sk } of keyCounts.values()) {
        if (count > 1) {
          return yield* Effect.fail(
            DynamoDBError.duplicateTransactionTarget(pk, sk),
          );
        }
      }

      const writes = yield* Effect.forEach(items, (item) =>
        Effect.map(nextUlid, item.apply),
      );

      yield* Effect.flatMap(DynamoDB.resolve(this), ({ client, tableName }) =>
        client.transactWriteItems({
          TransactItems: writes.map((write) =>
            write.kind === 'put'
              ? { Put: { TableName: tableName, ...write.options } }
              : { Update: { TableName: tableName, ...write.options } },
          ) as any,
        }),
      ).pipe(
        Effect.mapError((cause) => mapTransactionError(cause, items, writes)),
      );

      const connectionService = yield* Effect.serviceOption(Broadcaster).pipe(
        Effect.map(Option.getOrNull),
      );

      const entities = writes.map((write) => write.broadcast);
      if (entities.length > 0) {
        connectionService?.broadcast(entities);
      }
      return entities;
    }).pipe(
      Effect.withSpan('dynamodb.table.transact', {
        attributes: { operationCount: items.length },
      }),
    );
  };

  /**
   * Writes items in batches of 25 (DynamoDB BatchWriteItem limit).
   * Returns indices of items that DynamoDB did not process.
   */
  batchWrite = (
    items: Record<string, unknown>[],
  ): Effect.Effect<
    { unprocessedIndexes: number[] },
    DynamoDBError,
    DynamoDB
  > => {
    return Effect.gen({ self: this }, function* () {
      const { client, tableName } = yield* DynamoDB.resolve(this).pipe(
        Effect.mapError(DynamoDBError.batchWriteFailed),
      );
      const unprocessedIndexes: number[] = [];

      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const requests = chunk.map((item) => ({
          PutRequest: { Item: marshall(item) },
        }));

        const response: any = yield* client
          .batchWriteItem({
            RequestItems: { [tableName]: requests },
          })
          .pipe(Effect.mapError(DynamoDBError.batchWriteFailed));

        const unprocessed: any[] = response.UnprocessedItems?.[tableName] ?? [];

        for (let u = 0; u < unprocessed.length; u++) {
          const unprocessedItem = unmarshall(unprocessed[u].PutRequest.Item);
          const originalIdx = chunk.findIndex(
            (item) =>
              item[this.primary.pk] === unprocessedItem[this.primary.pk] &&
              item[this.primary.sk] === unprocessedItem[this.primary.sk],
          );
          if (originalIdx !== -1) unprocessedIndexes.push(i + originalIdx);
        }
      }

      return { unprocessedIndexes };
    }).pipe(
      Effect.withSpan('dynamodb.table.batch-write', {
        attributes: { itemCount: items.length },
      }),
    );
  };

  /**
   * Deletes all items from the table. Scans and deletes in a loop.
   */
  dangerouslyRemoveAllItems = (
    _: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, DynamoDBError, DynamoDB> =>
    Effect.gen({ self: this }, function* () {
      let lastKey: Record<string, unknown> | undefined;
      let itemsDeleted = 0;

      do {
        const result = yield* this.#scanPage(
          lastKey ? { ExclusiveStartKey: lastKey } : undefined,
        );

        if (result.Items.length > 0) {
          yield* Effect.all(
            result.Items.map((item) =>
              this.#deleteStoredItem({
                pk: item[this.primary.pk] as string,
                sk: item[this.primary.sk] as string,
              }),
            ),
            { concurrency: 25 },
          );
          itemsDeleted += result.Items.length;
        }

        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      return { itemsDeleted };
    });

  dangerouslyRemoveEntityItems = (
    entityName: string,
    _: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, DynamoDBError, DynamoDB> =>
    Effect.gen({ self: this }, function* () {
      let lastKey: Record<string, unknown> | undefined;
      let itemsDeleted = 0;

      do {
        const result = yield* this.#scanPage(
          lastKey ? { ExclusiveStartKey: lastKey } : undefined,
        );
        const entityItems = result.Items.filter(
          (item) => item._e === entityName,
        );

        if (entityItems.length > 0) {
          yield* Effect.all(
            entityItems.map((item) =>
              this.#deleteStoredItem({
                pk: item[this.primary.pk] as string,
                sk: item[this.primary.sk] as string,
              }),
            ),
            { concurrency: 25 },
          );
          itemsDeleted += entityItems.length;
        }

        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      return { itemsDeleted };
    });

  /**
   * Gets the table schema configuration for creating the table.
   * Includes key schema, attribute definitions, and secondary indexes.
   *
   * @returns The table schema without the TableName field
   */
  getTableSchema(): Omit<CreateTableInput, 'TableName'> {
    const allSecondaryKeys = Object.entries(this.secondaryIndexMap).map(
      ([IndexName, index]) => ({
        IndexName,
        pk: index.pk,
        sk: index.sk,
        kind: this.#indexKind(index),
      }),
    );

    const globalSecondaryIndexes = allSecondaryKeys
      .filter((v) => v.kind === 'gsi')
      .map(({ IndexName, pk, sk }) => ({
        IndexName,
        KeySchema: [
          { AttributeName: pk, KeyType: 'HASH' as const },
          { AttributeName: sk, KeyType: 'RANGE' as const },
        ],
        Projection: { ProjectionType: 'ALL' as const },
      }));

    const localSecondaryIndexes = allSecondaryKeys
      .filter((v) => v.kind === 'lsi')
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

  createTableDefinition(): Omit<CreateTableInput, 'TableName'> {
    return this.getTableSchema();
  }
}

/**
 * Builder class for configuring DynamoDB table indexes.
 */
class DynamoTableBuilder<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  #logicalName: string;
  #primary: TPrimaryIndex;
  #secondaryIndexMap: TSecondaryIndexMap;

  constructor(
    logicalName: string,
    primary: TPrimaryIndex,
    secondaryIndexMap: TSecondaryIndexMap,
  ) {
    this.#logicalName = logicalName;
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
    >(this.#logicalName, this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk: this.#primary.pk, sk, kind: 'lsi' },
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
    >(this.#logicalName, this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk, sk, kind: 'gsi' },
    } as TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>);
  }

  /**
   * Builds the final DynamoTable instance with all configured indexes.
   *
   * @returns The configured DynamoTable
   */
  build(): DynamoTable<TPrimaryIndex, TSecondaryIndexMap> {
    return new DynamoTable(
      this.#logicalName,
      this.#primary,
      this.#secondaryIndexMap,
    );
  }
}
