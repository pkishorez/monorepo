/* eslint-disable ts/no-empty-object-type */
import type {
  DeleteItemInput,
  DynamoDB,
  GetItemInput,
  PutItemInput,
  UpdateItemInput,
} from 'dynamodb-client';
import type {
  ExprInput,
  KeyConditionExprParameters,
  UpdateExprParameters,
} from './expr/index.js';
import type { ProjectionKeys } from './expr/projection.js';
import type { QueryOptions, ScanOptions } from './query-executor.js';
import type {
  DynamoConfig,
  IndexDefinition,
  ItemForPut,
  ItemWithKeys,
  RealKeyFromIndex,
  SecondaryIndexDefinition,
  Simplify,
} from './types.js';
import { createDynamoDB } from 'dynamodb-client';
import { Effect } from 'effect';
import { buildExpression } from './expr/index.js';
import { DynamoQueryExecutor } from './query-executor.js';
import { marshall, unmarshall } from './utils.js';

export type PutOptions = Omit<
  PutItemInput,
  'TableName' | 'Item' | 'ConditionExpression' | 'Key'
> & {
  condition?: ExprInput;
};
export type UpdateOptions<Item = Record<string, unknown>> = Omit<
  UpdateItemInput,
  | 'TableName'
  | 'Key'
  | 'ConditionExpression'
  | 'UpdateExpression'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'
> & {
  condition?: ExprInput;
  update: UpdateExprParameters<Item>;
};

export type DeleteOptions = Omit<
  DeleteItemInput,
  'TableName' | 'Key' | 'ConditionExpression'
> & {
  condition?: ExprInput;
};

export class DynamoTable<
  TPrimary extends IndexDefinition,
  TSecondaryIndexes extends Record<string, SecondaryIndexDefinition> = {},
  TItem extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly #name: string;
  readonly #client: DynamoDB;
  readonly #queryExecutor: DynamoQueryExecutor<TItem>;

  readonly primary: TPrimary;
  readonly secondaryIndexes: TSecondaryIndexes;

  constructor(config: {
    name: string;
    primary: TPrimary;
    gsis: TSecondaryIndexes;
    dynamoConfig: DynamoConfig;
  }) {
    this.#name = config.name;
    this.primary = config.primary;
    this.secondaryIndexes = config.gsis;

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
    return {
      primary<TPk extends string, TSk extends string | undefined = undefined>(
        pk: TPk,
        sk?: TSk,
      ): ConfiguredTableBuilder<
        TSk extends string ? { pk: TPk; sk: TSk } : { pk: TPk },
        {}
      > {
        const primaryIndex = (sk ? { pk, sk } : { pk }) as TSk extends string
          ? { pk: TPk; sk: TSk }
          : { pk: TPk };

        return new ConfiguredTableBuilder(name, primaryIndex, {}, dynamoConfig);
      },
    };
  }

  get name() {
    return this.#name;
  }

  // Primary table operations
  getItem(
    key: RealKeyFromIndex<TPrimary>,
    {
      projection,
      ...options
    }: Omit<GetItemInput, 'Key' | 'TableName' | 'ProjectionExpression'> & {
      projection?: ProjectionKeys<TItem>;
    } = {},
  ) {
    const result = buildExpression({ projection });
    const getOptions: GetItemInput = {
      TableName: this.#name,
      Key: marshall(key),
      ...options,
      ...result,
    };

    return this.#client.getItem(getOptions).pipe(
      Effect.map((response) => ({
        ...response,
        Item: response.Item
          ? (unmarshall(response.Item) as ItemWithKeys<TPrimary, TItem>)
          : null,
      })),
    );
  }

  putItem(
    index: RealKeyFromIndex<TPrimary>,
    item: ItemForPut<TSecondaryIndexes, TItem>,
    options: PutOptions = {},
  ) {
    const result = buildExpression({ condition: options.condition });

    return this.#client
      .putItem({
        TableName: this.#name,
        Item: marshall({ ...index, ...item }),
        ...options,
        ...result,
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

  updateItem(key: RealKeyFromIndex<TPrimary>, options: UpdateOptions<TItem>) {
    // Build expressions using the helper
    const result = buildExpression({
      condition: options.condition,
      update: options.update,
    });
    const updateItemOptions: UpdateItemInput = {
      TableName: this.#name,
      Key: marshall(key),
      ...options,
      ...result,
    };

    return this.#client.updateItem(updateItemOptions).pipe(
      Effect.map((response) => ({
        ...response,
        Attributes: response.Attributes
          ? unmarshall(response.Attributes)
          : undefined,
      })),
    );
  }

  deleteItem(key: RealKeyFromIndex<TPrimary>, options: DeleteOptions = {}) {
    const result = buildExpression({ condition: options.condition });
    const deleteItemOptions: DeleteItemInput = {
      TableName: this.#name,
      Key: marshall(key),
      ...options,
      ...result,
    };

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
    options?: QueryOptions<TPrimary, TItem>,
  ) {
    return this.#queryExecutor.executeQuery(key, this.primary, options).pipe(
      Effect.map((response) => ({
        ...response,
        Items: (response.Items || []).map((item) =>
          unmarshall(item),
        ) as ItemWithKeys<TPrimary, TItem>[],
        LastEvaluatedKey: response.LastEvaluatedKey
          ? (unmarshall(
              response.LastEvaluatedKey,
            ) as RealKeyFromIndex<TPrimary>)
          : undefined,
      })),
    );
  }

  scan(options?: ScanOptions<TPrimary, TItem>) {
    return this.#queryExecutor.executeScan(options).pipe(
      Effect.map((response) => ({
        ...response,
        Items: (response.Items || []).map((item) =>
          unmarshall(item),
        ) as ItemWithKeys<TPrimary, TItem>[],
        LastEvaluatedKey: response.LastEvaluatedKey
          ? (unmarshall(
              response.LastEvaluatedKey,
            ) as RealKeyFromIndex<TPrimary>)
          : undefined,
      })),
    );
  }

  // GSI operations
  index<TName extends keyof TSecondaryIndexes>(indexName: TName) {
    return {
      query: (
        key: KeyConditionExprParameters<TSecondaryIndexes[TName]>,
        options?: QueryOptions<TSecondaryIndexes[TName], TItem>,
      ) => {
        return this.#queryExecutor
          .executeQuery(key, this.secondaryIndexes[indexName], {
            ...options,
            indexName: indexName as string,
          })
          .pipe(
            Effect.map((response) => ({
              ...response,
              Items: (response.Items || []).map((item) =>
                unmarshall(item),
              ) as ItemWithKeys<TPrimary, TItem>[],
              LastEvaluatedKey: response.LastEvaluatedKey
                ? (unmarshall(response.LastEvaluatedKey) as RealKeyFromIndex<
                    TSecondaryIndexes[TName]
                  >)
                : undefined,
            })),
          );
      },

      scan: (options?: ScanOptions<TSecondaryIndexes[TName], TItem>) => {
        return this.#queryExecutor
          .executeScan({ ...options, indexName: indexName as string })
          .pipe(
            Effect.map((response) => ({
              ...response,
              Items: (response.Items || []).map((item) =>
                unmarshall(item),
              ) as ItemWithKeys<TPrimary, TItem>[],
              LastEvaluatedKey: response.LastEvaluatedKey
                ? (unmarshall(response.LastEvaluatedKey) as RealKeyFromIndex<
                    TSecondaryIndexes[TName]
                  >)
                : undefined,
            })),
          );
      },
    };
  }
}

// Configured builder - shows gsi(), lsi(), and build() methods
class ConfiguredTableBuilder<
  TPrimary extends IndexDefinition,
  TSecondaryIndexes extends Record<string, IndexDefinition> = {},
> {
  readonly #name: string;
  readonly #primary: TPrimary;
  readonly #secondaryIndexes: TSecondaryIndexes;
  readonly #dynamoConfig: DynamoConfig;

  constructor(
    name: string,
    primary: TPrimary,
    secondaryIndexes: TSecondaryIndexes,
    dynamoConfig: DynamoConfig,
  ) {
    this.#name = name;
    this.#primary = primary;
    this.#secondaryIndexes = secondaryIndexes;
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
      TSecondaryIndexes &
        Record<TName, TSk extends string ? { pk: TPk; sk: TSk } : { pk: TPk }>
    >
  > {
    const gsiIndex = (sk ? { pk, sk } : { pk }) as TSk extends string
      ? { pk: TPk; sk: TSk }
      : { pk: TPk };

    const newGSIs = { ...this.#secondaryIndexes, [name]: gsiIndex } as Simplify<
      TSecondaryIndexes &
        Record<TName, TSk extends string ? { pk: TPk; sk: TSk } : { pk: TPk }>
    >;

    return new ConfiguredTableBuilder(
      this.#name,
      this.#primary,
      newGSIs,
      this.#dynamoConfig,
    );
  }

  lsi<TName extends string, TSk extends string>(
    name: TName,
    sk: TSk,
  ): ConfiguredTableBuilder<
    TPrimary,
    TSecondaryIndexes &
      Record<
        TName,
        TPrimary extends { pk: infer PK } ? { pk: PK; sk: TSk } : never
      >
  > {
    const lsiIndex = { pk: this.#primary.pk, sk } as TPrimary extends {
      pk: infer PK;
    }
      ? { pk: PK; sk: TSk }
      : never;

    const updatedSecondaryIndexes = {
      ...this.#secondaryIndexes,
      [name]: lsiIndex,
    } as TSecondaryIndexes &
      Record<
        TName,
        TPrimary extends { pk: infer PK } ? { pk: PK; sk: TSk } : never
      >;
    return new ConfiguredTableBuilder(
      this.#name,
      this.#primary,
      updatedSecondaryIndexes,
      this.#dynamoConfig,
    );
  }

  build<Item extends Record<string, any> = Record<string, any>>(): DynamoTable<
    TPrimary,
    TSecondaryIndexes,
    Item
  > {
    return new DynamoTable({
      name: this.#name,
      primary: this.#primary,
      gsis: this.#secondaryIndexes,
      dynamoConfig: this.#dynamoConfig,
    });
  }
}
