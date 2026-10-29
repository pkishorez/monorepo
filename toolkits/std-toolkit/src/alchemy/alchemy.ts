import { Layer } from 'effect';
import * as Provider from 'alchemy/Provider';
import {
  D1Migration,
  D1MigrationProvider,
  D1Table,
  D1TableProvider,
} from './d1/index.js';
import {
  DeployGuardProvider,
  DeployGuardResource,
  Providers,
  RetiredSnapshotGuardProvider,
  RetiredSnapshotGuardResource,
} from './deploy-guard/index.js';
import {
  DynamoDBMigration,
  DynamoDBMigrationProvider,
  DynamoDBTable,
  DynamoDBTableProvider,
} from './dynamodb/index.js';

export const providers = () =>
  Layer.effect(
    Providers,
    Provider.collection([
      DeployGuardResource,
      RetiredSnapshotGuardResource,
      D1Table,
      D1Migration,
      DynamoDBTable,
      DynamoDBMigration,
    ]),
  ).pipe(
    Layer.provideMerge(DeployGuardProvider()),
    Layer.provideMerge(RetiredSnapshotGuardProvider()),
    Layer.provideMerge(D1TableProvider()),
    Layer.provideMerge(D1MigrationProvider()),
    Layer.provideMerge(DynamoDBTableProvider()),
    Layer.provideMerge(DynamoDBMigrationProvider()),
  );
