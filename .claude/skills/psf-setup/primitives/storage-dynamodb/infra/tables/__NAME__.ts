import { retain } from 'alchemy/RemovalPolicy';
import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { makeDynamoDBTable } from 'std-toolkit/db/dynamodb/alchemy';
import { __NAME__Table } from '../../src/shared/contracts/__NAME__-table/index.ts';
import { isDeployedStage } from '../stage.ts';

export const provision__Name__Table = (stage: string) =>
  Effect.gen(function* () {
    const tableName = `__APP_NAME__-__NAME__-${stage}`;
    if (stage === 'placeholder') return tableName;

    if (isDeployedStage(stage)) {
      const table = yield* makeDynamoDBTable(
        DynamoDB.getTableDefinition(__NAME__Table),
        { resourceId: '__Name__Table', tableName },
      ).pipe(retain(stage === 'prod'));
      return table.tableName;
    }

    const database = DynamoDB.make(__NAME__Table, {
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
