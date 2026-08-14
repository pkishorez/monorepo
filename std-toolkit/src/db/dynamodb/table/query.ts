import { Effect, Schema } from 'effect';
import {
  OperationFailure,
  type QueryPosition,
  type QueryRequest,
} from '../../std-table/contract/index.js';
import type { AttributeValue, DynamoDBClient } from '../client/index.js';
import {
  buildExpr,
  keyConditionExpr,
  type KeyConditionExprParameters,
} from '../expression/index.js';
import { contractFailure } from './failure.js';
import type { DecodedItem, ItemSchema } from '../item-schema/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const selectedIndex = (table: DynamoTable, name: string | undefined) =>
  name === undefined
    ? table.primary
    : (table.localSecondaryIndexes[name] ?? table.globalSecondaryIndexes[name]);

const sortKeyParameter = (
  sort: QueryRequest['sort'],
): KeyConditionExprParameters['sk'] => {
  if (sort === undefined) return undefined;
  switch (sort.operator) {
    case '=':
      return sort.value;
    case '<':
      return { '<': sort.value };
    case '<=':
      return { '<=': sort.value };
    case '>':
      return { '>': sort.value };
    case '>=':
      return { '>=': sort.value };
    case 'between':
      return { between: [sort.value[0], sort.value[1]] };
    case 'beginsWith':
      return sort.value === '' ? undefined : { beginsWith: sort.value };
  }
};

const exclusiveStartKey = (
  table: DynamoTable,
  index: NonNullable<ReturnType<typeof selectedIndex>>,
  requestPk: string,
  startAfter: QueryPosition,
): Record<string, AttributeValue> | Error => {
  const primaryKey = {
    [table.primary.pk]: { S: startAfter.pk },
    [table.primary.sk]: { S: startAfter.sk },
  };
  if (!('kind' in index)) return primaryKey;
  if (startAfter.indexSk === undefined) {
    return new Error('startAfter.indexSk is required for index queries');
  }
  return index.kind === 'lsi'
    ? { ...primaryKey, [index.sk]: { S: startAfter.indexSk } }
    : {
        ...primaryKey,
        [index.pk]: { S: requestPk },
        [index.sk]: { S: startAfter.indexSk },
      };
};

export const queryItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  schema: ItemSchema,
  request: QueryRequest,
) => {
  const index = selectedIndex(table, request.index);
  if (index === undefined) {
    return Effect.fail(
      new OperationFailure({
        cause: new Error(`Unknown index "${request.index}"`),
      }),
    );
  }
  const expression = buildExpr({
    keyCondition: keyConditionExpr(index, {
      pk: request.pk,
      sk: sortKeyParameter(request.sort),
    }),
  });
  const start =
    request.startAfter === undefined
      ? undefined
      : exclusiveStartKey(table, index, request.pk, request.startAfter);
  if (start instanceof Error) {
    return Effect.fail(new OperationFailure({ cause: start }));
  }
  return client
    .query({
      TableName: tableName,
      ...(request.index === undefined ? {} : { IndexName: request.index }),
      ...expression,
      ScanIndexForward: !request.descending,
      Limit: request.limit,
      ...(start === undefined ? {} : { ExclusiveStartKey: start }),
    })
    .pipe(
      Effect.mapError(contractFailure),
      Effect.flatMap((result) =>
        Effect.forEach(result.Items ?? [], (item) =>
          Schema.encodeEffect(schema)(item as DecodedItem),
        ).pipe(
          Effect.map((items) => ({
            items,
            hasMore:
              result.LastEvaluatedKey !== undefined &&
              Object.keys(result.LastEvaluatedKey).length > 0,
          })),
          Effect.mapError(contractFailure),
        ),
      ),
    );
};
