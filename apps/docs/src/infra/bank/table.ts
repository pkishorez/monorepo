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

export const BankTable = Effect.gen(function* () {
  const stage = yield* Stage;
  return yield* isDeployedStage(stage)
    ? Effect.flatMap(dynamoSettings, ({ tableName }) =>
        makeDynamoDBTable(StdDynamoDB.getTableDefinition(bankTable), {
          resourceId: 'BankTable',
          tableName,
        }),
      )
    : ensureLocalTable;
}).pipe(Effect.orDie);
