import { Effect, Schema } from 'effect';
import type {
  ConditionalPut,
  ItemCondition,
  TransactCheck,
  TransactItem,
} from '../../std-table/contract/index.js';
import type { DynamoDBClient, TransactWriteItem } from '../client/index.js';
import { buildExpr, exprCondition } from '../expression/index.js';
import type { ItemSchema } from '../item-schema/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { decodeKey } from '../item-schema/index.js';
import { contractFailure, transactFailure } from './failure.js';

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const conditionExpr = (table: DynamoTable, condition: ItemCondition) => {
  if (condition.kind === 'not-exists') {
    return buildExpr({
      condition: exprCondition(($) => $.attributeNotExists(table.primary.pk)),
    });
  }
  if (condition.kind === 'exists') {
    return buildExpr({
      condition: exprCondition(($) => $.attributeExists(table.primary.pk)),
    });
  }
  return buildExpr({
    condition: exprCondition<{ readonly _u: string }>(($) =>
      $.cond('_u', '=', condition.value),
    ),
  });
};

const maybeConditionExpr = (
  table: DynamoTable,
  condition: ItemCondition | undefined,
) => (condition === undefined ? {} : conditionExpr(table, condition));

const writeInput = (
  table: DynamoTable,
  tableName: string,
  schema: ItemSchema,
  request: ConditionalPut,
) =>
  Schema.decodeEffect(schema)(request.item).pipe(
    Effect.flatMap((item) =>
      Effect.try({
        try: () => ({
          TableName: tableName,
          Item: item,
          ...maybeConditionExpr(table, request.condition),
        }),
        catch: contractFailure,
      }),
    ),
  );

export const writeItem = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  schema: ItemSchema,
  request: ConditionalPut,
) =>
  writeInput(table, tableName, schema, request).pipe(
    Effect.flatMap((input) => client.putItem(input)),
    Effect.asVoid,
    Effect.mapError(contractFailure),
  );

const checkInput = (
  table: DynamoTable,
  tableName: string,
  request: TransactCheck,
) =>
  Effect.try({
    try: () => ({
      TableName: tableName,
      Key: decodeKey(table, request.key),
      ...conditionExpr(table, request.condition),
    }),
    catch: contractFailure,
  });

export const transactWriteItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  schema: ItemSchema,
  requests: readonly TransactItem[],
) =>
  Effect.forEach(requests, (request) =>
    request.kind === 'check'
      ? checkInput(table, tableName, request).pipe(
          Effect.map((input): TransactWriteItem => ({ ConditionCheck: input })),
        )
      : writeInput(table, tableName, schema, request).pipe(
          Effect.map((input): TransactWriteItem => ({ Put: input })),
        ),
  ).pipe(
    Effect.flatMap((TransactItems) =>
      client.transactWriteItems({ TransactItems }),
    ),
    Effect.asVoid,
    Effect.mapError((cause) => transactFailure(requests, cause)),
  );
