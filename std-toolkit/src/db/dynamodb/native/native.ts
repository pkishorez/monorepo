import { Context, Effect, Layer } from 'effect';
import type { BatchWriteItemOutput, GetItemOutput } from '../client/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { marshall } from '../attribute-value/index.js';
import { DynamoDBNativeError } from '../setup/index.js';

declare const dynamoServiceType: unique symbol;
export interface DynamoTableService<Name extends string> {
  readonly client: DynamoDBClient;
  readonly tableName: string;
  readonly [dynamoServiceType]: Name;
}

const nativeTags = new Map<
  string,
  Context.Service<DynamoTableService<string>, DynamoTableService<string>>
>();

export const dynamoTableService = <Name extends string>(logicalName: Name) => {
  let tag = nativeTags.get(logicalName);
  if (tag === undefined) {
    tag = Context.Service<DynamoTableService<string>>(
      `std-toolkit/db/DynamoTable/${logicalName}`,
    );
    nativeTags.set(logicalName, tag);
  }
  return tag as unknown as Context.Service<
    DynamoTableService<Name>,
    DynamoTableService<Name>
  >;
};

export const makeNativeService = <Name extends string>(
  logicalName: Name,
  client: DynamoDBClient,
  tableName: string,
) => {
  const tag = dynamoTableService(logicalName);
  const service = { client, tableName } as DynamoTableService<Name>;
  return Layer.succeed(tag, service);
};

export const getItem = <Name extends string>(
  logicalName: Name,
  key: Readonly<Record<string, unknown>>,
  options?: { readonly consistentRead?: boolean },
): Effect.Effect<
  GetItemOutput,
  DynamoDBNativeError,
  DynamoTableService<Name>
> =>
  Effect.gen(function* () {
    const service = yield* dynamoTableService(logicalName);
    return yield* service.client
      .getItem({
        TableName: service.tableName,
        Key: marshall(key),
        ...(options?.consistentRead === undefined
          ? {}
          : { ConsistentRead: options.consistentRead }),
      })
      .pipe(
        Effect.mapError(
          (cause) => new DynamoDBNativeError({ operation: 'getItem', cause }),
        ),
      );
  });

export const batchInsert = <
  Name extends string,
  Item extends Readonly<Record<string, unknown>>,
>(
  logicalName: Name,
  items: readonly Item[],
): Effect.Effect<
  BatchWriteItemOutput,
  DynamoDBNativeError,
  DynamoTableService<Name>
> =>
  Effect.gen(function* () {
    const service = yield* dynamoTableService(logicalName);
    const unprocessed = [];
    for (let offset = 0; offset < items.length; offset += 25) {
      const chunk = items.slice(offset, offset + 25);
      const result = yield* service.client
        .batchWriteItem({
          RequestItems: {
            [service.tableName]: chunk.map((item) => ({
              PutRequest: { Item: marshall(item) },
            })),
          },
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new DynamoDBNativeError({ operation: 'batchInsert', cause }),
          ),
        );
      unprocessed.push(...(result.UnprocessedItems?.[service.tableName] ?? []));
    }
    return unprocessed.length === 0
      ? {}
      : { UnprocessedItems: { [service.tableName]: unprocessed } };
  });

export { update } from './entity-update.js';
