import { Layer } from 'effect';
import * as Provider from 'alchemy/Provider';
import { AlchemyMigrations } from '../migrations/alchemy/index.js';
import { Providers } from './collection/index.js';
import { D1Table, D1TableProvider } from './d1/index.js';
import {
  SnapshotCheck,
  SnapshotCheckProvider,
  SnapshotRecord,
  SnapshotRecordProvider,
} from './dynamodb/index.js';

/**
 * Every std-toolkit resource type, with the retired ones a migration keeps
 * registered so Alchemy can delete them. Provide Cloudflare's providers to it
 * for `D1.table`, and AWS's for `DynamoDB.table`.
 */
export const providers = () =>
  Layer.effect(
    Providers,
    Provider.collection([
      D1Table,
      SnapshotCheck,
      SnapshotRecord,
      ...AlchemyMigrations.resources,
    ]),
  ).pipe(
    Layer.provideMerge(D1TableProvider()),
    Layer.provideMerge(SnapshotCheckProvider()),
    Layer.provideMerge(SnapshotRecordProvider()),
    Layer.provideMerge(AlchemyMigrations.providers()),
  );
