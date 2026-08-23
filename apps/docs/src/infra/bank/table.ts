import { Stage } from 'alchemy';
import { makeDynamoDBTable } from '@monorepo/alchemy-toolkit/unstable/dynamo-table';
import { Effect } from 'effect';
import { DynamoDB as StdDynamoDB } from 'std-toolkit/db/dynamodb';
import { bankTable } from '../../demos/bank/std-table/table/index.ts';
import { dynamoSettings } from './config.ts';
import { dynamoClient, tableExists } from './dynamo.ts';
import { isDeployedStage } from '../stage.ts';

const ensureLocalTable = Effect.gen(function* () {
  const dynamo = yield* dynamoClient;
  yield* dynamo.setup.pipe(
    Effect.catch((error) =>
      tableExists(error) ? Effect.void : Effect.die(error),
    ),
  );
});

// `alchemy state tree` evaluates the stack under a placeholder stage with real
// AWS credentials, so a local create is gated on a local endpoint, not on stage.
export const BankTable = Effect.gen(function* () {
  const stage = yield* Stage;
  const { tableName, endpoint } = yield* dynamoSettings;
  if (isDeployedStage(stage)) {
    return yield* makeDynamoDBTable(StdDynamoDB.getTableDefinition(bankTable), {
      resourceId: 'BankTable',
      tableName,
    });
  }
  if (endpoint !== '') yield* ensureLocalTable;
}).pipe(Effect.orDie);
