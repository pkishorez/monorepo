import { retain } from 'alchemy/RemovalPolicy';
import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { makeDynamoDBTable } from 'std-toolkit/db/dynamodb/alchemy';
import { appTable } from '../../shared/contracts/app-table/index.ts';

export const provisionTable = (
  stage: string,
  tableName: string,
  deployed: boolean,
) =>
  Effect.gen(function* () {
    if (stage === 'placeholder') return tableName;

    if (deployed) {
      const table = yield* makeDynamoDBTable(
        DynamoDB.getTableDefinition(appTable),
        {
          resourceId: 'AppTable',
          tableName,
        },
      ).pipe(retain(stage === 'prod'));
      return table.tableName;
    }

    const database = DynamoDB.make(appTable, {
      tableName,
      region: 'local',
      endpoint: 'http://localhost:8090',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    yield* database.setup.pipe(
      Effect.catch((error) => {
        const cause = error.cause;
        return typeof cause === 'object' &&
          cause !== null &&
          '_tag' in cause &&
          cause._tag === 'ResourceInUseException'
          ? Effect.void
          : Effect.fail(error);
      }),
    );
    return tableName;
  }).pipe(Effect.orDie);
