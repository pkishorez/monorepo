import { Effect } from "effect";
import { createDynamoDB, type DynamoDBClient } from "./DynamoClient.js";
import { DynamodbError } from "../errors.js";
import type {
  DynamoTableConfig,
  IndexDefinition,
  MarshalledOutput,
  TransactItem,
} from "../types/index.js";
import { marshall, unmarshall } from "../internal/marshall.js";
import {
  keyConditionExpr,
  type KeyConditionExprParameters,
} from "../expr/key-condition.js";
import { buildExpr } from "../expr/expr.js";
import {
  compileConditionExpr,
  type ConditionOperation,
} from "../expr/condition.js";

export interface QueryResult {
  Items: Record<string, unknown>[];
  LastEvaluatedKey?: Record<string, unknown>;
}

export interface DynamoTableInstance<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<string, IndexDefinition>,
> {
  readonly tableName: string;
  readonly primary: TPrimaryIndex;
  readonly secondaryIndexMap: TSecondaryIndexMap;

  getItem(
    key: IndexDefinition,
    options?: { ConsistentRead?: boolean },
  ): Effect.Effect<{ Item: Record<string, unknown> | null }, DynamodbError>;

  putItem(
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: "ALL_OLD";
    },
  ): Effect.Effect<{ Attributes: Record<string, unknown> | null }, DynamodbError>;

  updateItem(
    key: IndexDefinition,
    options: {
      UpdateExpression?: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
      ReturnValues?: "ALL_NEW" | "ALL_OLD";
    },
  ): Effect.Effect<{ Attributes: Record<string, unknown> | null }, DynamodbError>;

  deleteItem(
    key: IndexDefinition,
  ): Effect.Effect<void, DynamodbError>;

  query(
    cond: KeyConditionExprParameters,
    options?: {
      IndexName?: string;
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamodbError>;

  scan(
    options?: {
      IndexName?: string;
      Limit?: number;
    },
  ): Effect.Effect<QueryResult, DynamodbError>;

  index<IndexName extends keyof TSecondaryIndexMap>(indexName: IndexName): {
    query(
      cond: KeyConditionExprParameters,
      options?: {
        Limit?: number;
        ScanIndexForward?: boolean;
        filter?: ConditionOperation;
      },
    ): Effect.Effect<QueryResult, DynamodbError>;

    scan(
      options?: { Limit?: number },
    ): Effect.Effect<QueryResult, DynamodbError>;
  };

  opPutItem(
    value: Record<string, unknown>,
    options?: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
    },
  ): TransactItem;

  opUpdateItem(
    key: IndexDefinition,
    options: {
      UpdateExpression: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: MarshalledOutput;
    },
  ): TransactItem;

  transact(
    items: TransactItem[],
  ): Effect.Effect<void, DynamodbError>;
}

export namespace DynamoTable {
  export function make(config: DynamoTableConfig) {
    return {
      primary<Pk extends string, Sk extends string>(pk: Pk, sk: Sk) {
        return new DynamoTableBuilder(config, { pk, sk }, {});
      },
    };
  }
}

function createDynamoTableInstance<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(
  config: DynamoTableConfig,
  primary: TPrimaryIndex,
  secondaryIndexMap: TSecondaryIndexMap,
  client: DynamoDBClient,
): DynamoTableInstance<TPrimaryIndex, TSecondaryIndexMap> {
  const tableName = config.tableName;

  const rawQuery = (
    indexDef: IndexDefinition,
    cond: KeyConditionExprParameters,
    options?: {
      IndexName?: string;
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation;
    },
  ): Effect.Effect<QueryResult, DynamodbError> => {
    const expr = buildExpr({
      keyCondition: keyConditionExpr(indexDef, cond),
      filter: options?.filter ? compileConditionExpr(options.filter) : undefined,
    });

    const queryOptions: Record<string, unknown> = {
      TableName: tableName,
      ...expr,
    };

    if (options?.IndexName) queryOptions.IndexName = options.IndexName;
    if (options?.Limit !== undefined) queryOptions.Limit = options.Limit;
    if (options?.ScanIndexForward !== undefined) queryOptions.ScanIndexForward = options.ScanIndexForward;

    return client.query(queryOptions).pipe(
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
  };

  const rawScan = (options?: { IndexName?: string; Limit?: number }): Effect.Effect<QueryResult, DynamodbError> => {
    const scanOptions: Record<string, unknown> = { TableName: tableName };
    if (options?.IndexName) scanOptions.IndexName = options.IndexName;
    if (options?.Limit !== undefined) scanOptions.Limit = options.Limit;

    return client.scan(scanOptions).pipe(
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
  };

  return {
    tableName,
    primary,
    secondaryIndexMap,

    getItem(key, options) {
      return client
        .getItem({
          TableName: tableName,
          Key: marshall({
            [primary.pk]: key.pk,
            [primary.sk]: key.sk,
          }),
          ConsistentRead: options?.ConsistentRead,
        })
        .pipe(
          Effect.map((response: any) => ({
            Item: response.Item ? unmarshall(response.Item) : null,
          })),
          Effect.mapError(DynamodbError.getItemFailed),
        );
    },

    putItem(value, options) {
      const putOptions: Record<string, unknown> = {
        TableName: tableName,
        Item: marshall(value),
      };
      if (options?.ConditionExpression) putOptions.ConditionExpression = options.ConditionExpression;
      if (options?.ExpressionAttributeNames) putOptions.ExpressionAttributeNames = options.ExpressionAttributeNames;
      if (options?.ExpressionAttributeValues) putOptions.ExpressionAttributeValues = options.ExpressionAttributeValues;
      if (options?.ReturnValues) putOptions.ReturnValues = options.ReturnValues;

      return client.putItem(putOptions).pipe(
        Effect.map((response: any) => ({
          Attributes: response.Attributes ? unmarshall(response.Attributes) : null,
        })),
        Effect.mapError(DynamodbError.putItemFailed),
      );
    },

    updateItem(key, options) {
      const updateOptions: Record<string, unknown> = {
        TableName: tableName,
        Key: marshall({
          [primary.pk]: key.pk,
          [primary.sk]: key.sk,
        }),
      };
      if (options.UpdateExpression) updateOptions.UpdateExpression = options.UpdateExpression;
      if (options.ConditionExpression) updateOptions.ConditionExpression = options.ConditionExpression;
      if (options.ExpressionAttributeNames) updateOptions.ExpressionAttributeNames = options.ExpressionAttributeNames;
      if (options.ExpressionAttributeValues) updateOptions.ExpressionAttributeValues = options.ExpressionAttributeValues;
      if (options.ReturnValues) updateOptions.ReturnValues = options.ReturnValues;

      return client.updateItem(updateOptions).pipe(
        Effect.map((response: any) => ({
          Attributes: response.Attributes ? unmarshall(response.Attributes) : null,
        })),
        Effect.mapError(DynamodbError.updateItemFailed),
      );
    },

    deleteItem(key) {
      return client
        .deleteItem({
          TableName: tableName,
          Key: marshall({
            [primary.pk]: key.pk,
            [primary.sk]: key.sk,
          }),
        })
        .pipe(
          Effect.map(() => undefined),
          Effect.mapError(DynamodbError.deleteItemFailed),
        );
    },

    query(cond, options) {
      return rawQuery(primary, cond, options);
    },

    scan(options) {
      return rawScan(options);
    },

    index(indexName) {
      const indexDef = secondaryIndexMap[indexName as string];
      if (!indexDef) {
        throw new Error(`Index ${String(indexName)} not found`);
      }
      return {
        query(cond, options) {
          return rawQuery(indexDef, cond, {
            ...options,
            IndexName: indexName as string,
          });
        },
        scan(options) {
          return rawScan({
            ...options,
            IndexName: indexName as string,
          });
        },
      };
    },

    opPutItem(value, options) {
      const putOpts: TransactItem["options"] & { kind?: never } = {
        TableName: tableName,
        Item: marshall(value),
      };
      if (options?.ConditionExpression) putOpts.ConditionExpression = options.ConditionExpression;
      if (options?.ExpressionAttributeNames) putOpts.ExpressionAttributeNames = options.ExpressionAttributeNames;
      if (options?.ExpressionAttributeValues) putOpts.ExpressionAttributeValues = options.ExpressionAttributeValues;

      return { kind: "put" as const, options: putOpts };
    },

    opUpdateItem(key, options) {
      const updateOpts: TransactItem["options"] & { kind?: never } = {
        TableName: tableName,
        Key: marshall({
          [primary.pk]: key.pk,
          [primary.sk]: key.sk,
        }),
        UpdateExpression: options.UpdateExpression,
      };
      if (options.ConditionExpression) updateOpts.ConditionExpression = options.ConditionExpression;
      if (options.ExpressionAttributeNames) updateOpts.ExpressionAttributeNames = options.ExpressionAttributeNames;
      if (options.ExpressionAttributeValues) updateOpts.ExpressionAttributeValues = options.ExpressionAttributeValues;

      return { kind: "update" as const, options: updateOpts };
    },

    transact(items) {
      return client
        .transactWriteItems({
          TransactItems: items.map((item) =>
            item.kind === "put"
              ? { Put: item.options }
              : { Update: item.options },
          ),
        })
        .pipe(
          Effect.map(() => undefined),
          Effect.mapError(DynamodbError.transactionFailed),
        );
    },
  };
}

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

  lsi<IndexName extends string, Sk extends string>(name: IndexName, sk: Sk) {
    return new DynamoTableBuilder<
      TPrimaryIndex,
      TSecondaryIndexMap & Record<IndexName, { pk: TPrimaryIndex["pk"]; sk: Sk }>
    >(this.#config, this.#primary, {
      ...this.#secondaryIndexMap,
      [name]: { pk: this.#primary.pk, sk },
    } as TSecondaryIndexMap & Record<IndexName, { pk: TPrimaryIndex["pk"]; sk: Sk }>);
  }

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

  build(): DynamoTableInstance<TPrimaryIndex, TSecondaryIndexMap> {
    const client = createDynamoDB(this.#config);
    return createDynamoTableInstance(
      this.#config,
      this.#primary,
      this.#secondaryIndexMap,
      client,
    );
  }
}

// Legacy export for backwards compatibility - remove in next major version
export function makeDynamoTable(config: DynamoTableConfig) {
  return DynamoTable.make(config);
}
