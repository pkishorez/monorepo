import { Effect, Option } from 'effect';
import { step } from 'laymos/story';
import { DynamoDB } from './dynamo-client.js';
import { DynamodbError } from '../errors.js';
import type {
  AnyEntityESchema,
  AnySingleEntityESchema,
} from '../../../eschema/index.js';
import { Broadcaster, nextUlid, type EntityType } from '../../../core/index.js';
import { DynamoEntity } from './dynamo-entity.js';
import { DynamoSingleEntity } from './dynamo-single-entity.js';
import type {
  IndexDefinition,
  MarshalledOutput,
  TransactItem,
  TransactWrite,
} from '../types/index.js';
import type { CreateTableInput } from '../generated/types.js';
import { marshall, unmarshall } from '../internal/marshall.js';
import {
  keyConditionExpr,
  type KeyConditionExprParameters,
} from '../expr/key-condition.js';
import { buildExpr } from '../expr/build-expr.js';
import { type ConditionOperation } from '../expr/condition.js';

interface CancellationReason {
  readonly Code?: string;
  readonly Message?: string;
}

const mapTransactionError = (
  cause: unknown,
  items: ReadonlyArray<TransactItem>,
  writes: ReadonlyArray<TransactWrite>,
): DynamodbError => {
  const reasons = (cause as { cancellationReasons?: unknown })
    ?.cancellationReasons;
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
      return DynamodbError.conditionFailed(failures);
    }
  }

  return DynamodbError.transactionFailed(cause);
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
> {
  readonly primary: TPrimaryIndex;
  readonly secondaryIndexMap: TSecondaryIndexMap;
  #entityNames = new Set<string>();

  constructor(primary: TPrimaryIndex, secondaryIndexMap: TSecondaryIndexMap) {
    this.primary = primary;
    this.secondaryIndexMap = secondaryIndexMap;
  }

  #registerEntity = (entity: { name: string }) => {
    if (this.#entityNames.has(entity.name)) {
      throw new Error(
        `Entity "${entity.name}" is already defined on this table`,
      );
    }
    this.#entityNames.add(entity.name);
  };

  /**
   * Defines a keyed entity on this table from an ESchema.
   * The entity is registered into the table when `.build()` is called.
   *
   * @param eschema - The entity's ESchema
   * @returns A builder to configure the primary index derivation
   */
  entity<TS extends AnyEntityESchema>(eschema: TS) {
    return DynamoEntity.make<DynamoTable<TPrimaryIndex, TSecondaryIndexMap>>(
      this,
      this.#registerEntity,
    ).eschema(eschema);
  }

  /**
   * Defines a singleton entity on this table from an ESchema.
   * The entity is registered into the table when `.default()` is called.
   *
   * @param eschema - The single entity's ESchema
   * @returns A builder to set the default value
   */
  singleEntity<TS extends AnySingleEntityESchema>(eschema: TS) {
    return DynamoSingleEntity.make<
      DynamoTable<TPrimaryIndex, TSecondaryIndexMap>
    >(this, this.#registerEntity).eschema(eschema);
  }

  /**
   * Creates a new DynamoDB table builder.
   *
   * The table definition is pure topology (keys and indexes); the physical
   * table name and connection are supplied separately via {@link dynamoDBLayer}.
   *
   * @returns A builder to configure the primary key
   */
  static make() {
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
        return new DynamoTableBuilder({ pk, sk }, {});
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
  ): Effect.Effect<QueryResult, DynamodbError, DynamoDB> {
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

    return step(
      'Query DynamoDB index',
      {
        description:
          'Compiles the key and filter expressions, queries one table index, and decodes its page.',
        attributes: {
          index: options?.IndexName ?? 'primary',
          limit: options?.Limit,
        },
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
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
        Effect.mapError(DynamodbError.queryFailed),
      ),
    );
  }

  #rawScan(options?: {
    IndexName?: string;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
    Segment?: number;
    TotalSegments?: number;
    ConsistentRead?: boolean;
  }): Effect.Effect<QueryResult, DynamodbError, DynamoDB> {
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

    return step(
      'Scan DynamoDB index',
      {
        description:
          'Scans one table index and decodes the returned page and continuation key.',
        attributes: {
          index: options?.IndexName ?? 'primary',
          limit: options?.Limit,
        },
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
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
        Effect.mapError(DynamodbError.scanFailed),
      ),
    );
  }

  #rawDeleteItem(
    key: IndexDefinition,
  ): Effect.Effect<void, DynamodbError, DynamoDB> {
    return step(
      'Delete DynamoDB item',
      {
        description:
          'Physically removes one item identified by the table primary key.',
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
        client.deleteItem({
          TableName: tableName,
          Key: marshall({
            [this.primary.pk]: key.pk,
            [this.primary.sk]: key.sk,
          }),
        }),
      ).pipe(
        Effect.map(() => undefined),
        Effect.mapError(DynamodbError.deleteItemFailed),
      ),
    );
  }

  describe(): Effect.Effect<TableDescription, DynamodbError, DynamoDB> {
    return step(
      'Describe DynamoDB table',
      {
        description:
          'Reads the physical table status, size estimates, and secondary-index metadata.',
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
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
        Effect.mapError(DynamodbError.describeFailed),
      ),
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
  ): Effect.Effect<
    { Item: Record<string, unknown> | null },
    DynamodbError,
    DynamoDB
  > {
    return step(
      'Get DynamoDB item',
      {
        description:
          'Reads one item by its exact primary key and decodes its DynamoDB attributes.',
        attributes: { consistentRead: options?.ConsistentRead ?? false },
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
        client.getItem({
          TableName: tableName,
          Key: marshall({
            [this.primary.pk]: key.pk,
            [this.primary.sk]: key.sk,
          }),
          ConsistentRead: options?.ConsistentRead,
        }),
      ).pipe(
        Effect.map((response: any) => ({
          Item: response.Item ? unmarshall(response.Item) : null,
        })),
        Effect.mapError(DynamodbError.getItemFailed),
      ),
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
    DynamodbError,
    DynamoDB
  > {
    return step(
      'Put DynamoDB item',
      {
        description:
          'Marshalls and writes one complete item, applying its optional condition expression.',
        attributes: { conditional: options?.ConditionExpression !== undefined },
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
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
        Effect.mapError(DynamodbError.putItemFailed),
      ),
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
      ReturnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE';
    },
  ): Effect.Effect<
    { Attributes: Record<string, unknown> | null },
    DynamodbError,
    DynamoDB
  > {
    return step(
      'Update DynamoDB item',
      {
        description:
          'Applies a compiled update expression to one item and decodes the requested returned attributes.',
        attributes: { conditional: options.ConditionExpression !== undefined },
      },
      Effect.flatMap(DynamoDB, ({ client, tableName }) =>
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
        Effect.mapError(DynamodbError.updateItemFailed),
      ),
    );
  }

  /**
   * Deletes an item from the table.
   *
   * @param key - The primary key of the item to delete
   */
  deleteItem(
    key: IndexDefinition,
  ): Effect.Effect<void, DynamodbError, DynamoDB> {
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
  ): Effect.Effect<QueryResult, DynamodbError, DynamoDB> {
    return this.#rawQuery(this.primary, cond, options);
  }

  /**
   * Scans all items in the table.
   *
   * @param options - Scan options including limit
   * @returns The scan result with items and optional pagination token
   */
  scan(
    options?: TableScanOptions,
  ): Effect.Effect<QueryResult, DynamodbError, DynamoDB> {
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
      query(
        cond: KeyConditionExprParameters,
        options?: {
          Limit?: number;
          ScanIndexForward?: boolean;
          filter?: ConditionOperation;
        },
      ): Effect.Effect<QueryResult, DynamodbError, DynamoDB> {
        return rawQuery(indexDef, cond, {
          ...options,
          IndexName: indexName as string,
        });
      },
      /**
       * Scans all items in the secondary index.
       */
      scan(
        options?: IndexScanOptions,
      ): Effect.Effect<QueryResult, DynamodbError, DynamoDB> {
        return rawScan({
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
  transact(
    items: TransactItem[],
  ): Effect.Effect<EntityType<unknown>[], DynamodbError, DynamoDB> {
    return step(
      'Commit DynamoDB transaction',
      {
        description:
          'Validates deferred entity operations, stamps their commit cursors, and submits one atomic write.',
        attributes: { operations: items.length },
      },
      Effect.gen({ self: this }, function* () {
        if (items.length === 0) return [];

        for (const item of items) {
          if (item.table !== this) {
            yield* Effect.die(
              new Error(
                `Transact item "${item.entityName}" was produced by a different table instance`,
              ),
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
            return yield* Effect.die(
              new Error(
                `transact requires unique items; ${count} ops target pk=${pk} sk=${sk}`,
              ),
            );
          }
        }

        const writes = yield* Effect.forEach(items, (item) =>
          Effect.map(nextUlid, item.apply),
        );

        yield* Effect.flatMap(DynamoDB, ({ client, tableName }) =>
          client.transactWriteItems({
            TransactItems: writes.map((write) =>
              write.kind === 'put'
                ? { Put: { TableName: tableName, ...write.options } }
                : { Update: { TableName: tableName, ...write.options } },
            ),
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
      }),
    );
  }

  /**
   * Writes items in batches of 25 (DynamoDB BatchWriteItem limit).
   * Returns indices of items that DynamoDB did not process.
   */
  batchWrite(
    items: Record<string, unknown>[],
  ): Effect.Effect<{ unprocessedIndexes: number[] }, DynamodbError, DynamoDB> {
    return step(
      'Batch write DynamoDB items',
      {
        description:
          'Splits raw items into DynamoDB batches of twenty-five and reports any unprocessed inputs.',
        attributes: { items: items.length },
      },
      Effect.gen({ self: this }, function* () {
        const { client, tableName } = yield* DynamoDB;
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
            .pipe(Effect.mapError(DynamodbError.batchWriteFailed));

          const unprocessed: any[] =
            response.UnprocessedItems?.[tableName] ?? [];

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
      }),
    );
  }

  /**
   * Deletes all items from the table. Scans and deletes in a loop.
   */
  dangerouslyRemoveAllItems(
    _: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, DynamodbError, DynamoDB> {
    return step(
      'Remove every DynamoDB item',
      {
        description:
          'Scans every page and physically deletes all items from the isolated table.',
      },
      Effect.gen({ self: this }, function* () {
        let lastKey: Record<string, unknown> | undefined;
        let itemsDeleted = 0;

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
            itemsDeleted += result.Items.length;
          }

          lastKey = result.LastEvaluatedKey;
        } while (lastKey);

        return { itemsDeleted };
      }),
    );
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
  #primary: TPrimaryIndex;
  #secondaryIndexMap: TSecondaryIndexMap;

  constructor(primary: TPrimaryIndex, secondaryIndexMap: TSecondaryIndexMap) {
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
    >(this.#primary, {
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
    >(this.#primary, {
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
    return new DynamoTable(this.#primary, this.#secondaryIndexMap);
  }
}
