import { retain } from 'alchemy/RemovalPolicy';
import { Effect } from 'effect';
import * as StdAlchemy from 'std-toolkit/alchemy';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { __NAME__Table } from '../../src/shared/contracts/__NAME__-table/index.ts';
import { isDeployedStage } from '../stage.ts';

export const provision__Name__Table = (stage: string) =>
  Effect.gen(function* () {
    const tableName = `__APP_NAME__-__NAME__-${stage}`;
    if (stage === 'placeholder') return tableName;

    if (isDeployedStage(stage)) {
      const table = yield* StdAlchemy.DynamoDB.table('__Name__Table', {
        table: __NAME__Table,
        tableName,
      }).pipe(retain(stage === 'prod'));
      return table.tableName;
    }

    yield* DynamoDB.createTable(__NAME__Table, {
      tableName,
      region: 'local',
      endpoint: 'http://localhost:8090',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    return tableName;
  }).pipe(Effect.orDie);
