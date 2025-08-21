/* eslint-disable ts/no-empty-object-type */
import type {
  DeleteItemInput,
  DynamoDB,
  GetItemInput,
  PutItemInput,
  QueryInput,
  ScanInput,
  UpdateItemInput,
} from 'dynamodb-client';
import type {
  DynamoConfig,
  IndexDefinition,
  ItemForPut,
  ItemWithKeys,
  KeyConditionExprParameters,
  KeyFromIndex,
  SecondaryIndexDefinition,
  Simplify,
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
  getItem(
    key: KeyFromIndex<TPrimary>,
    options?: Omit<GetItemInput, 'Key' | 'TableName'>,
  ) {
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
    options?: Omit<PutItemInput, 'TableName' | 'Item'>,
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

  updateItem(
    key: KeyFromIndex<TPrimary>,
    options?: Omit<UpdateItemInput, 'TableName' | 'Key'>,
  ) {
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

  deleteItem(
    key: KeyFromIndex<TPrimary>,
    options?: Omit<DeleteItemInput, 'TableName' | 'Key'>,
  ) {
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
    options?: Omit<QueryInput, 'TableName' | 'Key'>,
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

  scan(options?: Omit<ScanInput, 'TableName'>) {
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
        options?: Omit<QueryInput, 'TableName' | 'Key'>,
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
                ? (unmarshall(
                    response.LastEvaluatedKey,
                  ) as KeyFromIndex<TPrimary>)
                : undefined,
            })),
          );
      },

      scan: (options?: Omit<ScanInput, 'TableName'>) => {
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
                ? (unmarshall(
                    response.LastEvaluatedKey,
                  ) as KeyFromIndex<TPrimary>)
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
        options?: Omit<QueryInput, 'TableName' | 'Key'>,
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
                ? (unmarshall(
                    response.LastEvaluatedKey,
                  ) as KeyFromIndex<TPrimary>)
                : undefined,
            })),
          );
      },

      scan: (options?: Omit<ScanInput, 'TableName'>) => {
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
                ? (unmarshall(
                    response.LastEvaluatedKey,
                  ) as KeyFromIndex<TPrimary>)
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
