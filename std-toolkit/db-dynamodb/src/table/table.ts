import {
  AttributeValue,
  AWSClientConfig,
  createDynamoDB,
  CreateTableInput,
  DynamoDB,
  UpdateItemInput,
  Update,
  Put,
  TransactWriteItemsInput,
} from 'dynamodb-client';
import {
  IndexDefinition,
  TGetItemInput,
  TPut,
  TPutItemInput,
  TQueryInput,
  TScanInput,
  TUpdate,
  TUpdateItemInput,
} from './types.js';
import { Except, Simplify } from 'type-fest';
import { Effect } from 'effect';
import { marshall, unmarshall } from './utils.js';
import {
  keyConditionExpr,
  KeyConditionExprParameters,
} from './expr/key-condition.js';
import { buildExpr } from './expr/expr.js';
import { ConditionOperation, compileConditionExpr } from './expr/condition.js';

type Ops =
  | {
      kind: 'update';
      options: Update;
    }
  | {
      kind: 'put';
      options: Put;
    };
export class DynamoTable<
  PrimaryIndexDefinition extends IndexDefinition,
  SecondaryIndexDefinitionMap extends Record<string, IndexDefinition>,
> {
  static make(config: AWSClientConfig & { tableName: string }) {
    return {
      primary<Pk extends string, Sk extends string>(pk: Pk, sk: Sk) {
        return new SecondaryIndexCreator(config, { pk, sk }, {});
      },
    };
  }

  #config: AWSClientConfig & { tableName: string };
  readonly primary: PrimaryIndexDefinition;
  readonly secondaryIndexMap: SecondaryIndexDefinitionMap;
  #client: DynamoDB;
  constructor(
    config: AWSClientConfig & { tableName: string },
    primary: PrimaryIndexDefinition,
    indexMap: SecondaryIndexDefinitionMap,
  ) {
    this.#config = config;
    this.primary = primary;
    this.secondaryIndexMap = indexMap;

    this.#client = createDynamoDB(config);
  }

  getItem({ pk, sk }: IndexDefinition, options?: TGetItemInput) {
    return this.#client
      .getItem({
        ...options,
        TableName: this.#config.tableName,
        Key: marshall({
          [this.primary.pk]: pk,
          [this.primary.sk]: sk,
        }),
      })
      .pipe(
        Effect.map((response) => ({
          ...response,
          Item: response.Item ? unmarshall(response.Item) : null,
        })),
      );
  }

  putItem(
    value: Record<
      PrimaryIndexDefinition['pk'] | PrimaryIndexDefinition['sk'],
      string
    > &
      Record<string, unknown>,
    { debug, ...options }: TPutItemInput & { debug?: boolean },
  ) {
    const putOptions: Put = {
      ...options,
      TableName: this.#config.tableName,
      Item: marshall(value),
    };
    if (debug) {
      console.log('PUT OPTIONS: ', putOptions);
    }
    return this.#client.putItem(putOptions).pipe(
      Effect.map(({ Attributes, ...response }) => ({
        ...response,
        Attributes: Attributes ? unmarshall(Attributes) : null,
      })),
    );
  }

  opPutItem(
    value: Record<
      PrimaryIndexDefinition['pk'] | PrimaryIndexDefinition['sk'],
      string
    > &
      Record<string, unknown>,
    { debug, ...options }: TPut & { debug?: boolean },
  ) {
    const putOptions: Put = {
      ...options,
      TableName: this.#config.tableName,
      Item: marshall(value),
    };
    if (debug) {
      console.log('PUT OPTIONS: ', putOptions);
    }

    return { kind: 'put', options: putOptions } as Extract<
      Ops,
      { kind: 'put' }
    >;
  }

  transactWriteItems(
    values: Ops[],
    options?: Omit<TransactWriteItemsInput, 'TrasactItems'>,
  ) {
    return this.#client
      .transactWriteItems({
        ...options,
        TransactItems: values.map((value) => {
          if (value.kind === 'put') {
            return {
              Put: value.options,
            };
          } else {
            return {
              Update: value.options,
            };
          }
        }),
      })
      .pipe(
        Effect.catchTag('TransactionCanceledException', (err) => {
          const { _tag, message, cause, Message, stack, name } = err;
          return Effect.fail({
            _tag,
            message,
            cause,
            Message,
            stack,
            name,
            CancellationReasons: err.CancellationReasons?.map((reason) => ({
              ...reason,
              Item: reason.Item && unmarshall(reason.Item),
            })),
          });
        }),
      );
  }

  updateItem(
    key: IndexDefinition,
    {
      debug,
      ...options
    }: TUpdateItemInput & {
      debug?: boolean;
    },
  ) {
    const updateOptions: UpdateItemInput = {
      ...options,
      TableName: this.#config.tableName,
      Key: marshall({
        [this.primary.pk]: key.pk,
        [this.primary.sk]: key.sk,
      }),
    };
    if (debug) {
      console.dir(updateOptions, { depth: 10 });
    }
    return this.#client.updateItem(updateOptions).pipe(
      Effect.map(({ Attributes, ...response }) => ({
        ...response,
        Attributes: Attributes ? unmarshall(Attributes) : null,
      })),
    );
  }

  opUpdateItem(
    key: IndexDefinition,
    {
      debug,
      ...options
    }: TUpdate & {
      debug?: boolean;
    },
  ) {
    const updateOptions: Update = {
      ...options,
      TableName: this.#config.tableName,
      Key: marshall({
        [this.primary.pk]: key.pk,
        [this.primary.sk]: key.sk,
      }),
    };
    if (debug) {
      console.dir(updateOptions, { depth: 10 });
    }

    return { kind: 'update', options: updateOptions } as Extract<
      Ops,
      { kind: 'update' }
    >;
  }

  query(
    cond: KeyConditionExprParameters,
    options: Except<TQueryInput, 'IndexName'> & {
      debug?: boolean;
      filter?: ConditionOperation;
    },
  ) {
    return this.#rawQueryOperation(this.primary, cond, options);
  }
  scan(options: Except<TScanInput, 'IndexName'>) {
    return this.#scanOperation(options);
  }

  index(indexName: keyof SecondaryIndexDefinitionMap) {
    return {
      query: (
        cond: KeyConditionExprParameters,
        options: Except<TQueryInput, 'IndexName'> & {
          filter?: ConditionOperation;
        },
      ) => {
        return this.#rawQueryOperation(
          this.secondaryIndexMap[indexName],
          cond,
          {
            ...options,
            IndexName: indexName as string,
          },
        );
      },
      scan: (options: Except<TScanInput, 'IndexName'>) => {
        return this.#scanOperation({
          ...options,
          IndexName: indexName as string,
        });
      },
    };
  }

  purge(confirm: 'i know what i am doing') {
    if (confirm !== 'i know what i am doing') {
      return Effect.void;
    }

    return Effect.gen(this, function* () {
      let lastEvaluated: Record<string, AttributeValue> | undefined;
      let count = 0;

      while (true) {
        const { Items, LastEvaluatedKey } = yield* this.#client
          .scan({
            TableName: this.#config.tableName,
            ExclusiveStartKey: lastEvaluated!,
          })
          .pipe(
            Effect.map(({ Items = [], ...rest }) => ({
              ...rest,
              Items: Items.map(unmarshall),
            })),
          );
        if (Items.length === 0) break;

        count += Items.length;
        lastEvaluated = LastEvaluatedKey as any;

        yield* Effect.all(
          Items.map((item) =>
            this.#client.deleteItem({
              TableName: this.#config.tableName,
              Key: marshall({
                [this.primary.pk]: item[this.primary.pk],
                [this.primary.sk]: item[this.primary.sk],
              }),
            }),
          ),
          { concurrency: 'unbounded' },
        );

        if (!lastEvaluated) {
          break;
        }
      }
      return count;
    });
  }

  getTableSchema(): Except<CreateTableInput, 'TableName'> {
    const allSecondaryKeys = Object.entries(this.secondaryIndexMap).map(
      ([IndexName, { pk, sk }]) => ({ IndexName, pk, sk }),
    );
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
      GlobalSecondaryIndexes: allSecondaryKeys
        .filter((v) => v.pk !== this.primary.pk)
        .map(({ IndexName, pk, sk }) => ({
          IndexName: IndexName,
          KeySchema: [
            { AttributeName: pk, KeyType: 'HASH' },
            { AttributeName: sk, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        })),
      LocalSecondaryIndexes: allSecondaryKeys
        .filter((v) => v.pk === this.primary.pk)
        .map(({ IndexName, pk, sk }) => ({
          IndexName: IndexName,
          KeySchema: [
            { AttributeName: pk, KeyType: 'HASH' },
            { AttributeName: sk, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        })),
      BillingMode: 'PAY_PER_REQUEST',
    };
  }

  #rawQueryOperation(
    indexDef: IndexDefinition,
    cond: KeyConditionExprParameters,
    {
      debug,
      filter,
      ...options
    }: TQueryInput & { debug?: boolean; filter?: ConditionOperation },
  ) {
    const expr = buildExpr({
      keyCondition: keyConditionExpr(indexDef, cond),
      filter: filter ? compileConditionExpr(filter) : undefined,
    });

    const queryOptions = {
      ...options,
      TableName: this.#config.tableName,
      ...expr,
    };

    if (debug) {
      console.log(JSON.stringify(queryOptions, null, 2));
    }

    return this.#client.query(queryOptions).pipe(
      Effect.map(({ Items, ...rest }) => ({
        ...rest,
        Items: Items?.map(unmarshall) ?? [],
      })),
    );
  }

  #scanOperation(options: TScanInput) {
    return this.#client
      .scan({
        ...options,
        TableName: this.#config.tableName,
      })
      .pipe(
        Effect.map(({ Items, ...rest }) => ({
          ...rest,
          Items: Items?.map(unmarshall) ?? [],
        })),
      );
  }
}

class SecondaryIndexCreator<
  PrimaryIndex extends IndexDefinition,
  IndexDefinitionMap extends Record<string, IndexDefinition>,
> {
  #config: AWSClientConfig & { tableName: string };
  #primary: PrimaryIndex;
  #indexDefMap: IndexDefinitionMap;
  constructor(
    config: AWSClientConfig & { tableName: string },
    primary: PrimaryIndex,
    indexDefMap: IndexDefinitionMap,
  ) {
    this.#config = config;
    this.#primary = primary;
    this.#indexDefMap = indexDefMap;
  }

  lsi<IndexName extends string, Sk extends string>(name: IndexName, sk: Sk) {
    return new SecondaryIndexCreator<
      PrimaryIndex,
      IndexDefinitionMap & Record<IndexName, { pk: PrimaryIndex['pk']; sk: Sk }>
    >(this.#config, this.#primary, {
      ...this.#indexDefMap,
      [name]: { pk: this.#primary['pk'], sk },
    });
  }
  gsi<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ) {
    return new SecondaryIndexCreator<
      PrimaryIndex,
      IndexDefinitionMap & Record<IndexName, { pk: Pk; sk: Sk }>
    >(this.#config, this.#primary, {
      ...this.#indexDefMap,
      [name]: { pk, sk },
    });
  }

  build() {
    return new DynamoTable<PrimaryIndex, Simplify<IndexDefinitionMap>>(
      this.#config,
      this.#primary,
      this.#indexDefMap,
    );
  }
}
