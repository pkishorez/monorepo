import { Effect, Schema } from 'effect';
import type {
  ConditionalPut,
  PutCondition,
} from '../../std-table/contract/index.js';
import type { DynamoDBClient } from '../client/index.js';
import { buildExpr, exprCondition } from '../expression/index.js';
import type { ItemSchema } from '../item-schema/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { contractFailure } from './failure.js';

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const conditionExpr = (
  table: DynamoTable,
  condition: PutCondition | undefined,
) => {
  if (condition?.kind === 'not-exists') {
    return buildExpr({
      condition: exprCondition(($) => $.attributeNotExists(table.primary.pk)),
    });
  }
  if (condition?.kind === 'updated') {
    return buildExpr({
      condition: exprCondition<{ readonly _u: string }>(($) =>
        $.cond('_u', '=', condition.value),
      ),
    });
  }
  return {};
};

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
          ...conditionExpr(table, request.condition),
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

export const transactWriteItems = (
  client: DynamoDBClient,
  table: DynamoTable,
  tableName: string,
  schema: ItemSchema,
  requests: readonly ConditionalPut[],
) =>
  Effect.forEach(requests, (request) =>
    writeInput(table, tableName, schema, request).pipe(
      Effect.map((input) => ({ Put: input })),
    ),
  ).pipe(
    Effect.flatMap((TransactItems) =>
      client.transactWriteItems({ TransactItems }),
    ),
    Effect.asVoid,
    Effect.mapError(contractFailure),
  );
