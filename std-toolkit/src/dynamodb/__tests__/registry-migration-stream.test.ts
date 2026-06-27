import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Effect, Layer, Schema, Stream } from 'effect';
import { EntityESchema, SingleEntityESchema } from '../../eschema/index.js';
import { Broadcaster } from '../../core/index.js';

import {
  DynamoEntity,
  DynamoSingleEntity,
  DynamoTable,
  EntityRegistry,
} from '../index.js';
import {
  createDynamoDB,
  dynamoDBLayer,
  DynamoDB,
} from '../services/dynamo-client.js';

const itEffect = <A, E>(
  name: string,
  fn: () => Effect.Effect<A, E, DynamoDB>,
) =>
  it(name, () =>
    Effect.runPromise(fn().pipe(Effect.provide(dynamoDBLayer(localConfig)))),
  );

const TEST_TABLE_NAME = `db-dynamodb-registry-migration-${Date.now()}`;
const LOCAL_ENDPOINT = 'http://localhost:8090';

const localConfig = {
  tableName: TEST_TABLE_NAME,
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
  endpoint: LOCAL_ENDPOINT,
};

const table = DynamoTable.make()
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();

const accountSchema = EntityESchema.make('Account', 'accountId', {
  email: Schema.String,
  status: Schema.String,
}).build();

const Account = DynamoEntity.make(table)
  .eschema(accountSchema)
  .primary({ pk: ['accountId'] })
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .build();

const evolvingAccountSchema = EntityESchema.make(
  'EvolvingAccount',
  'accountId',
  {
    email: Schema.String,
    status: Schema.String,
  },
)
  .evolve('v2', { plan: Schema.String }, (value) => ({
    ...value,
    plan: 'free',
  }))
  .build();

const EvolvingAccount = DynamoEntity.make(table)
  .eschema(evolvingAccountSchema)
  .primary({ pk: ['accountId'] })
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .build();

const settingsSchema = SingleEntityESchema.make('Settings', {
  theme: Schema.String,
}).build();

const Settings = DynamoSingleEntity.make(table)
  .eschema(settingsSchema)
  .default({ theme: 'light' });

const evolvedSettingsSchema = SingleEntityESchema.make('EvolvedSettings', {
  theme: Schema.String,
})
  .evolve('v2', { maxRetries: Schema.Number }, (value) => ({
    ...value,
    maxRetries: 3,
  }))
  .build();

const EvolvedSettings = DynamoSingleEntity.make(table)
  .eschema(evolvedSettingsSchema)
  .default({ theme: 'light', maxRetries: 3 });

const registry = EntityRegistry.make(table)
  .register(Account)
  .register(EvolvingAccount)
  .registerSingle(Settings)
  .registerSingle(EvolvedSettings)
  .build();

const makeObservedRegistry = (observed: {
  scans?: unknown[];
  describes?: unknown[];
}) => {
  const client = createDynamoDB(localConfig);
  const observedClient = {
    ...client,
    scan: (input: unknown) => {
      observed.scans?.push(input);
      return client.scan(input);
    },
    describeTable: (input: unknown) => {
      observed.describes?.push(input);
      return client.describeTable(input);
    },
  };
  const ObservedAccount = DynamoEntity.make(table)
    .eschema(accountSchema)
    .primary({ pk: ['accountId'] })
    .index('GSI1', 'byEmail', { pk: ['email'] })
    .build();
  const ObservedEvolvingAccount = DynamoEntity.make(table)
    .eschema(evolvingAccountSchema)
    .primary({ pk: ['accountId'] })
    .index('GSI1', 'byEmail', { pk: ['email'] })
    .build();
  const ObservedSettings = DynamoSingleEntity.make(table)
    .eschema(settingsSchema)
    .default({ theme: 'light' });
  const ObservedEvolvedSettings = DynamoSingleEntity.make(table)
    .eschema(evolvedSettingsSchema)
    .default({ theme: 'light', maxRetries: 3 });

  const registry = EntityRegistry.make(table)
    .register(ObservedAccount)
    .register(ObservedEvolvingAccount)
    .registerSingle(ObservedSettings)
    .registerSingle(ObservedEvolvedSettings)
    .build();

  return {
    registry,
    layer: Layer.succeed(DynamoDB, {
      client: observedClient,
      tableName: TEST_TABLE_NAME,
    }),
  };
};

async function createTestTable() {
  const client = createDynamoDB(localConfig);

  await Effect.runPromise(
    client
      .createTable({
        TableName: TEST_TABLE_NAME,
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
          {
            IndexName: 'GSI2',
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH' },
              { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      })
      .pipe(
        Effect.catch((e) => {
          const errorName = (e as any)?.error?.name;
          if (errorName === 'ResourceInUseException') {
            return Effect.void;
          }
          return Effect.fail(e);
        }),
      ),
  );
}

async function deleteTestTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(client.deleteTable({ TableName: TEST_TABLE_NAME }));
  } catch {
    // Ignore cleanup errors.
  }
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sortedRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) => stableStringify(row)).sort((a, b) => a.localeCompare(b));

const emptyDrift = () => ({
  dataDrift: 0,
  indexDrift: 0,
  primaryKeyChanged: 0,
});

describe('registry migration dry-run stream', () => {
  beforeAll(async () => {
    await createTestTable();
  });

  beforeEach(async () => {
    await Effect.runPromise(
      table
        .dangerouslyPurgeAllItems('I KNOW WHAT I AM DOING')
        .pipe(Effect.provide(dynamoDBLayer(localConfig))),
    );
  });

  afterAll(async () => {
    await deleteTestTable();
  });

  itEffect(
    'streams dry-run reports for registered entity rows without modifying stored rows',
    () =>
      Effect.gen(function* () {
        yield* Account.insert({
          accountId: 'valid',
          email: 'valid@example.com',
          status: 'active',
        });
        yield* Settings.put({ theme: 'dark' });
        yield* table.putItem({
          pk: 'Account#stale-index',
          sk: 'stale-index',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'stale-index',
          email: 'stale-index@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'Account#corrupt',
          sk: 'corrupt',
          _e: 'Account',
          _v: 'v1',
          _d: false,
          accountId: 'corrupt',
          email: 'corrupt@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'Account#wrong-key',
          sk: 'key-change',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'key-change',
          email: 'key-change@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'EvolvedSettings',
          sk: 'EvolvedSettings',
          _e: 'EvolvedSettings',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
        });
        yield* table.putItem({
          pk: 'MissingEntity',
          sk: 'MissingEntity',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          value: 'ignored',
        });
        yield* table.putItem({
          pk: 'Ghost',
          sk: 'Ghost',
          _e: 'Ghost',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          value: 'ignored',
        });

        const before = yield* table.scan({ ConsistentRead: true });

        const reports = yield* registry
          .migrateStream({ batchSize: 3 })
          .pipe(Stream.runCollect);
        const finalReport = reports.at(-1);

        expect(reports.length).toBeGreaterThanOrEqual(2);
        expect(reports[0]).toMatchObject({
          phase: 'initial',
          items: {
            scanned: 0,
            ignored: 0,
            migrate: 0,
            migrated: 0,
            failed: 0,
          },
        });
        expect(finalReport).toEqual({
          phase: 'completed',
          progress: {
            scanned: 8,
            total: expect.any(Number),
            percent: expect.any(Number),
            approximate: true,
          },
          items: {
            scanned: 8,
            ignored: 2,
            migrate: 3,
            migrated: 0,
            failed: 0,
          },
          issues: {
            warnings: 2,
            errors: 2,
          },
          entities: {
            Account: {
              scanned: 4,
              ignored: 0,
              migrate: 2,
              migrated: 0,
              failed: 0,
              issues: {
                warnings: 1,
                errors: 2,
              },
              drift: {
                dataDrift: 0,
                indexDrift: 1,
                primaryKeyChanged: 1,
              },
            },
            EvolvedSettings: {
              scanned: 1,
              ignored: 0,
              migrate: 1,
              migrated: 0,
              failed: 0,
              issues: {
                warnings: 1,
                errors: 0,
              },
              drift: {
                dataDrift: 1,
                indexDrift: 0,
                primaryKeyChanged: 0,
              },
            },
            Settings: {
              scanned: 1,
              ignored: 0,
              migrate: 0,
              migrated: 0,
              failed: 0,
              issues: {
                warnings: 0,
                errors: 0,
              },
              drift: emptyDrift(),
            },
          },
          segments: {
            '0': {
              scanned: 8,
              complete: true,
            },
          },
          failures: expect.arrayContaining([
            expect.objectContaining({
              entity: 'Account',
              key: {
                pk: 'Account#corrupt',
                sk: 'corrupt',
              },
              error: expect.stringContaining('Corrupt item'),
              timestamp: expect.any(String),
            }),
            expect.objectContaining({
              entity: 'Account',
              key: {
                pk: 'Account#wrong-key',
                sk: 'key-change',
              },
              error: expect.stringContaining('Primary key changed'),
              timestamp: expect.any(String),
            }),
          ]),
        });
        expect(finalReport?.failures).toHaveLength(2);

        const after = yield* table.scan({ ConsistentRead: true });
        expect(sortedRows(after.Items)).toEqual(sortedRows(before.Items));
      }),
  );

  itEffect(
    'returns the final dry-run report without modifying stored rows',
    () =>
      Effect.gen(function* () {
        const staleRow = {
          pk: 'Account#convenience-dry-run',
          sk: 'convenience-dry-run',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'convenience-dry-run',
          email: 'convenience-dry-run@example.com',
          status: 'active',
        };
        yield* table.putItem(staleRow);

        const before = yield* table.scan({ ConsistentRead: true });

        const report = yield* registry.migrate({
          progress: { estimatedTotal: false },
        });
        const streamedReports = yield* registry
          .migrateStream({ progress: { estimatedTotal: false } })
          .pipe(Stream.runCollect);

        expect(report).toEqual(streamedReports.at(-1));
        expect(report.items).toMatchObject({
          scanned: 1,
          migrate: 1,
          migrated: 0,
          failed: 0,
        });

        const after = yield* table.scan({ ConsistentRead: true });
        expect(sortedRows(after.Items)).toEqual(sortedRows(before.Items));
      }),
  );

  itEffect('rewrites stale regular rows when dryRun is false', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      yield* table.putItem({
        pk: 'EvolvingAccount#real-regular',
        sk: 'real-regular',
        GSI1PK: 'EvolvingAccount#byEmail#real-regular@example.com',
        GSI1SK: oldUpdate,
        _e: 'EvolvingAccount',
        _v: 'v1',
        _u: oldUpdate,
        _d: false,
        accountId: 'real-regular',
        email: 'real-regular@example.com',
        status: 'active',
        obsolete: 'remove-me',
      });

      const reports = yield* registry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);

      const { Item } = yield* table.getItem(
        {
          pk: 'EvolvingAccount#real-regular',
          sk: 'real-regular',
        },
        { ConsistentRead: true },
      );

      expect(reports.at(-1)?.items).toMatchObject({
        scanned: 1,
        migrate: 1,
        migrated: 1,
        failed: 0,
      });
      expect(Item).toEqual({
        pk: 'EvolvingAccount#real-regular',
        sk: 'real-regular',
        GSI1PK: 'EvolvingAccount#byEmail#real-regular@example.com',
        GSI1SK: expect.any(String),
        _e: 'EvolvingAccount',
        _v: 'v2',
        _u: expect.any(String),
        _d: false,
        accountId: 'real-regular',
        email: 'real-regular@example.com',
        status: 'active',
        plan: 'free',
      });
      expect(Item?._u).not.toBe(oldUpdate);
      expect(Item?.GSI1SK).toBe(Item?._u);
    }),
  );

  itEffect('returns the final real migration report after rewriting rows', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      const seedStaleRow = (accountId: string) =>
        table.putItem({
          pk: `EvolvingAccount#${accountId}`,
          sk: accountId,
          GSI1PK: `EvolvingAccount#byEmail#${accountId}@example.com`,
          GSI1SK: oldUpdate,
          _e: 'EvolvingAccount',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId,
          email: `${accountId}@example.com`,
          status: 'active',
          obsolete: 'remove-me',
        });

      yield* seedStaleRow('convenience-real');
      const streamedReports = yield* registry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);
      const streamedFinalReport = streamedReports.at(-1);

      yield* table.dangerouslyPurgeAllItems('I KNOW WHAT I AM DOING');
      yield* seedStaleRow('convenience-real');

      const report = yield* registry.migrate({
        dryRun: false,
        progress: { estimatedTotal: false },
      });
      const { Item } = yield* table.getItem(
        {
          pk: 'EvolvingAccount#convenience-real',
          sk: 'convenience-real',
        },
        { ConsistentRead: true },
      );

      expect(report).toEqual(streamedFinalReport);
      expect(report.items).toMatchObject({
        scanned: 1,
        migrate: 1,
        migrated: 1,
        failed: 0,
      });
      expect(Item).toEqual({
        pk: 'EvolvingAccount#convenience-real',
        sk: 'convenience-real',
        GSI1PK: 'EvolvingAccount#byEmail#convenience-real@example.com',
        GSI1SK: expect.any(String),
        _e: 'EvolvingAccount',
        _v: 'v2',
        _u: expect.any(String),
        _d: false,
        accountId: 'convenience-real',
        email: 'convenience-real@example.com',
        status: 'active',
        plan: 'free',
      });
      expect(Item?._u).not.toBe(oldUpdate);
      expect(Item).not.toHaveProperty('obsolete');
    }),
  );

  itEffect(
    'rewrites stale secondary index attributes when dryRun is false',
    () =>
      Effect.gen(function* () {
        const oldUpdate = '2026-01-01T00:00:00.000Z';
        yield* table.putItem({
          pk: 'Account#missing-index',
          sk: 'missing-index',
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'missing-index',
          email: 'missing-index@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'Account#changed-index',
          sk: 'changed-index',
          GSI1PK: 'Account#byEmail#wrong@example.com',
          GSI1SK: oldUpdate,
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'changed-index',
          email: 'changed-index@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'Account#obsolete-index',
          sk: 'obsolete-index',
          GSI1PK: 'Account#byEmail#obsolete-index@example.com',
          GSI1SK: oldUpdate,
          GSI2PK: 'Account#oldIndex#obsolete-index@example.com',
          GSI2SK: 'obsolete-index',
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'obsolete-index',
          email: 'obsolete-index@example.com',
          status: 'active',
        });

        const reports = yield* registry
          .migrateStream({
            dryRun: false,
            progress: { estimatedTotal: false },
          })
          .pipe(Stream.runCollect);

        const { Item: missing } = yield* table.getItem(
          { pk: 'Account#missing-index', sk: 'missing-index' },
          { ConsistentRead: true },
        );
        const { Item: changed } = yield* table.getItem(
          { pk: 'Account#changed-index', sk: 'changed-index' },
          { ConsistentRead: true },
        );
        const { Item: obsolete } = yield* table.getItem(
          { pk: 'Account#obsolete-index', sk: 'obsolete-index' },
          { ConsistentRead: true },
        );

        expect(reports.at(-1)?.items).toMatchObject({
          scanned: 3,
          migrate: 3,
          migrated: 3,
          failed: 0,
        });
        expect(missing).toMatchObject({
          GSI1PK: 'Account#byEmail#missing-index@example.com',
          GSI1SK: expect.any(String),
        });
        expect(changed).toMatchObject({
          GSI1PK: 'Account#byEmail#changed-index@example.com',
          GSI1SK: expect.any(String),
        });
        expect(obsolete).toMatchObject({
          GSI1PK: 'Account#byEmail#obsolete-index@example.com',
          GSI1SK: expect.any(String),
        });
        expect(obsolete).not.toHaveProperty('GSI2PK');
        expect(obsolete).not.toHaveProperty('GSI2SK');
        expect(missing?.GSI1SK).toBe(missing?._u);
        expect(changed?.GSI1SK).toBe(changed?._u);
        expect(obsolete?.GSI1SK).toBe(obsolete?._u);
      }),
  );

  itEffect('rewrites stale single-entity rows when dryRun is false', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      yield* table.putItem({
        pk: 'EvolvedSettings',
        sk: 'EvolvedSettings',
        _e: 'EvolvedSettings',
        _v: 'v1',
        _u: oldUpdate,
        theme: 'dark',
        obsolete: 'remove-me',
      });

      const reports = yield* registry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);

      const { Item } = yield* table.getItem(
        { pk: 'EvolvedSettings', sk: 'EvolvedSettings' },
        { ConsistentRead: true },
      );

      expect(reports.at(-1)?.items).toMatchObject({
        scanned: 1,
        migrate: 1,
        migrated: 1,
        failed: 0,
      });
      expect(Item).toEqual({
        pk: 'EvolvedSettings',
        sk: 'EvolvedSettings',
        _e: 'EvolvedSettings',
        _v: 'v2',
        _u: expect.any(String),
        theme: 'dark',
        maxRetries: 3,
      });
      expect(Item?._u).not.toBe(oldUpdate);
    }),
  );

  itEffect('migrates regular rows missing _d to canonical _d false', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      yield* table.putItem({
        pk: 'Account#missing-delete-flag',
        sk: 'missing-delete-flag',
        GSI1PK: 'Account#byEmail#missing-delete-flag@example.com',
        GSI1SK: oldUpdate,
        _e: 'Account',
        _v: 'v1',
        _u: oldUpdate,
        accountId: 'missing-delete-flag',
        email: 'missing-delete-flag@example.com',
        status: 'active',
      });

      const reports = yield* registry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);

      const { Item } = yield* table.getItem(
        { pk: 'Account#missing-delete-flag', sk: 'missing-delete-flag' },
        { ConsistentRead: true },
      );

      expect(reports.at(-1)?.items).toMatchObject({
        scanned: 1,
        migrate: 1,
        migrated: 1,
        failed: 0,
      });
      expect(Item).toMatchObject({
        _d: false,
        _u: expect.any(String),
      });
      expect(Item?._u).not.toBe(oldUpdate);
    }),
  );

  itEffect('rewrites rows with stale data and stale indexes once', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      yield* table.putItem({
        pk: 'EvolvingAccount#mixed-drift',
        sk: 'mixed-drift',
        GSI1PK: 'EvolvingAccount#byEmail#wrong@example.com',
        GSI1SK: oldUpdate,
        _e: 'EvolvingAccount',
        _v: 'v1',
        _u: oldUpdate,
        _d: false,
        accountId: 'mixed-drift',
        email: 'mixed-drift@example.com',
        status: 'active',
      });

      const reports = yield* registry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);

      const { Item } = yield* table.getItem(
        { pk: 'EvolvingAccount#mixed-drift', sk: 'mixed-drift' },
        { ConsistentRead: true },
      );

      expect(reports.at(-1)?.items).toMatchObject({
        scanned: 1,
        migrate: 1,
        migrated: 1,
        failed: 0,
      });
      expect(Item).toMatchObject({
        GSI1PK: 'EvolvingAccount#byEmail#mixed-drift@example.com',
        GSI1SK: expect.any(String),
        _v: 'v2',
        plan: 'free',
      });
      expect(Item?.GSI1SK).toBe(Item?._u);
    }),
  );

  itEffect(
    'does not write valid ignored corrupt or primary-key-changed rows',
    () =>
      Effect.gen(function* () {
        yield* Account.insert({
          accountId: 'skip-valid',
          email: 'skip-valid@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'IgnoredRealRun',
          sk: 'IgnoredRealRun',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          value: 'ignored',
        });
        yield* table.putItem({
          pk: 'Account#skip-corrupt',
          sk: 'skip-corrupt',
          _e: 'Account',
          _v: 'v1',
          _d: false,
          accountId: 'skip-corrupt',
          email: 'skip-corrupt@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'Account#wrong-key',
          sk: 'skip-key-change',
          _e: 'Account',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          _d: false,
          accountId: 'skip-key-change',
          email: 'skip-key-change@example.com',
          status: 'active',
        });

        const before = yield* table.scan({ ConsistentRead: true });

        const reports = yield* registry
          .migrateStream({
            dryRun: false,
            progress: { estimatedTotal: false },
          })
          .pipe(Stream.runCollect);

        const after = yield* table.scan({ ConsistentRead: true });

        expect(reports.at(-1)?.items).toMatchObject({
          scanned: 4,
          ignored: 1,
          migrate: 1,
          migrated: 0,
          failed: 0,
        });
        expect(sortedRows(after.Items)).toEqual(sortedRows(before.Items));
      }),
  );

  itEffect('does not broadcast real migration writes', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      let broadcasts = 0;
      yield* table.putItem({
        pk: 'Account#no-broadcast',
        sk: 'no-broadcast',
        _e: 'Account',
        _v: 'v1',
        _u: oldUpdate,
        _d: false,
        accountId: 'no-broadcast',
        email: 'no-broadcast@example.com',
        status: 'active',
      });

      const connectionLayer = Layer.succeed(Broadcaster, {
        emit: () => {},
        broadcast: () => {
          broadcasts += 1;
        },
        subscribe: () => {},
        unsubscribe: () => {},
      });

      const reports = yield* registry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect, Effect.provide(connectionLayer));

      expect(reports.at(-1)?.items).toMatchObject({
        migrated: 1,
        failed: 0,
      });
      expect(broadcasts).toBe(0);
    }),
  );

  itEffect(
    'does not fail rows that become valid after a conditional conflict',
    () =>
      Effect.gen(function* () {
        const oldUpdate = '2026-01-01T00:00:00.000Z';
        yield* table.putItem({
          pk: 'Account#conditional-race',
          sk: 'conditional-race',
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'conditional-race',
          email: 'conditional-race@example.com',
          status: 'active',
        });

        const migrationWriteIntent = Account.migrationWriteIntent.bind(Account);
        const RacingAccount = new Proxy(Account, {
          get(target, property) {
            if (property === 'migrationWriteIntent') {
              return (item: Record<string, unknown>) =>
                Effect.gen(function* () {
                  const intent = yield* migrationWriteIntent(item);
                  if (intent) {
                    yield* table.putItem(intent.item);
                  }
                  return intent;
                });
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as typeof Account;
        const racingRegistry = EntityRegistry.make(table)
          .register(RacingAccount)
          .build();

        const reports = yield* racingRegistry
          .migrateStream({
            dryRun: false,
            progress: { estimatedTotal: false },
          })
          .pipe(Stream.runCollect);

        const { Item } = yield* table.getItem(
          { pk: 'Account#conditional-race', sk: 'conditional-race' },
          { ConsistentRead: true },
        );

        expect(reports.at(-1)?.items).toMatchObject({
          scanned: 1,
          migrate: 1,
          migrated: 0,
          failed: 0,
        });
        expect(Item).toMatchObject({
          GSI1PK: 'Account#byEmail#conditional-race@example.com',
          GSI1SK: expect.any(String),
          accountId: 'conditional-race',
        });
        expect(Item?.GSI1SK).toBe(Item?._u);
      }),
  );

  itEffect(
    'retries conditional conflicts when the re-read row is still stale',
    () =>
      Effect.gen(function* () {
        const oldUpdate = '2026-01-01T00:00:00.000Z';
        yield* table.putItem({
          pk: 'Account#retry-stale-conflict',
          sk: 'retry-stale-conflict',
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'retry-stale-conflict',
          email: 'retry-stale-conflict@example.com',
          status: 'active',
        });

        const migrationWriteIntent = Account.migrationWriteIntent.bind(Account);
        let conflictsRemaining = 2;
        const RacingAccount = new Proxy(Account, {
          get(target, property) {
            if (property === 'migrationWriteIntent') {
              return (item: Record<string, unknown>) =>
                Effect.gen(function* () {
                  const intent = yield* migrationWriteIntent(item);
                  if (conflictsRemaining > 0) {
                    conflictsRemaining -= 1;
                    yield* table.putItem({
                      ...item,
                      _u: `2026-01-01T00:00:0${2 - conflictsRemaining}.000Z`,
                    });
                  }
                  return intent;
                });
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as typeof Account;
        const racingRegistry = EntityRegistry.make(table)
          .register(RacingAccount)
          .build();

        const reports = yield* racingRegistry
          .migrateStream({
            dryRun: false,
            progress: { estimatedTotal: false },
          })
          .pipe(Stream.runCollect);

        const { Item } = yield* table.getItem(
          { pk: 'Account#retry-stale-conflict', sk: 'retry-stale-conflict' },
          { ConsistentRead: true },
        );

        expect(reports.at(-1)?.items).toMatchObject({
          scanned: 1,
          migrate: 1,
          migrated: 1,
          failed: 0,
        });
        expect(Item).toMatchObject({
          GSI1PK: 'Account#byEmail#retry-stale-conflict@example.com',
          GSI1SK: expect.any(String),
          accountId: 'retry-stale-conflict',
        });
        expect(Item?.GSI1SK).toBe(Item?._u);
      }),
  );

  itEffect('counts persistent conditional conflicts as one failed row', () =>
    Effect.gen(function* () {
      const oldUpdate = '2026-01-01T00:00:00.000Z';
      let updateSequence = 0;
      yield* table.putItem({
        pk: 'Account#persistent-conflict',
        sk: 'persistent-conflict',
        _e: 'Account',
        _v: 'v1',
        _u: oldUpdate,
        _d: false,
        accountId: 'persistent-conflict',
        email: 'persistent-conflict@example.com',
        status: 'active',
      });

      const migrationWriteIntent = Account.migrationWriteIntent.bind(Account);
      const RacingAccount = new Proxy(Account, {
        get(target, property) {
          if (property === 'migrationWriteIntent') {
            return (item: Record<string, unknown>) =>
              Effect.gen(function* () {
                const intent = yield* migrationWriteIntent(item);
                updateSequence += 1;
                yield* table.putItem({
                  ...item,
                  _u: `2026-01-01T00:00:${String(updateSequence).padStart(2, '0')}.000Z`,
                });
                return intent;
              });
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as typeof Account;
      const racingRegistry = EntityRegistry.make(table)
        .register(RacingAccount)
        .build();

      const reports = yield* racingRegistry
        .migrateStream({
          dryRun: false,
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);

      const { Item } = yield* table.getItem(
        { pk: 'Account#persistent-conflict', sk: 'persistent-conflict' },
        { ConsistentRead: true },
      );
      const finalReport = reports.at(-1);

      expect(finalReport).toMatchObject({
        phase: 'completed-with-failures',
        items: {
          scanned: 1,
          migrate: 1,
          migrated: 0,
          failed: 1,
        },
      });
      expect(finalReport).not.toHaveProperty('retryCounters');
      expect(finalReport).not.toHaveProperty('samples');
      expect(finalReport).not.toHaveProperty('errors');
      expect(Item).not.toHaveProperty('GSI1PK');
    }),
  );

  itEffect(
    'counts exhausted migration write failures and continues scanning',
    () =>
      Effect.gen(function* () {
        const oldUpdate = '2026-01-01T00:00:00.000Z';
        yield* table.putItem({
          pk: 'Account#oversized-write-failure',
          sk: 'oversized-write-failure',
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'oversized-write-failure',
          email: 'oversized-write-failure@example.com',
          status: 'active',
        });
        yield* table.putItem({
          pk: 'Account#write-failure-continues',
          sk: 'write-failure-continues',
          _e: 'Account',
          _v: 'v1',
          _u: oldUpdate,
          _d: false,
          accountId: 'write-failure-continues',
          email: 'write-failure-continues@example.com',
          status: 'active',
        });

        const migrationWriteIntent = Account.migrationWriteIntent.bind(Account);
        const OversizedAccount = new Proxy(Account, {
          get(target, property) {
            if (property === 'migrationWriteIntent') {
              return (item: Record<string, unknown>) =>
                migrationWriteIntent(item).pipe(
                  Effect.map((intent) =>
                    item.accountId === 'oversized-write-failure' && intent
                      ? {
                          ...intent,
                          item: {
                            ...intent.item,
                            oversized: 'x'.repeat(450_000),
                          },
                        }
                      : intent,
                  ),
                );
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as typeof Account;
        const oversizedRegistry = EntityRegistry.make(table)
          .register(OversizedAccount)
          .build();

        const reports = yield* oversizedRegistry
          .migrateStream({
            dryRun: false,
            progress: { estimatedTotal: false },
          })
          .pipe(Stream.runCollect);

        const { Item: failedItem } = yield* table.getItem(
          {
            pk: 'Account#oversized-write-failure',
            sk: 'oversized-write-failure',
          },
          { ConsistentRead: true },
        );
        const { Item: continuedItem } = yield* table.getItem(
          {
            pk: 'Account#write-failure-continues',
            sk: 'write-failure-continues',
          },
          { ConsistentRead: true },
        );
        const finalReport = reports.at(-1);

        expect(finalReport).toMatchObject({
          phase: 'completed-with-failures',
          items: {
            scanned: 2,
            migrate: 2,
            migrated: 1,
            failed: 1,
          },
        });
        expect(finalReport).not.toHaveProperty('retryCounters');
        expect(finalReport).not.toHaveProperty('samples');
        expect(finalReport).not.toHaveProperty('errors');
        expect(failedItem).not.toHaveProperty('GSI1PK');
        expect(continuedItem).toMatchObject({
          GSI1PK: 'Account#byEmail#write-failure-continues@example.com',
          GSI1SK: expect.any(String),
        });
      }),
  );

  itEffect(
    'counts registered rows excluded by the entity filter as ignored',
    () =>
      Effect.gen(function* () {
        yield* Account.insert({
          accountId: 'filtered-account',
          email: 'filtered-account@example.com',
          status: 'active',
        });
        yield* Settings.put({ theme: 'dark' });
        yield* table.putItem({
          pk: 'EvolvedSettings',
          sk: 'EvolvedSettings',
          _e: 'EvolvedSettings',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          theme: 'dark',
        });
        yield* table.putItem({
          pk: 'MissingEntityForFilter',
          sk: 'MissingEntityForFilter',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          value: 'ignored',
        });
        yield* table.putItem({
          pk: 'GhostForFilter',
          sk: 'GhostForFilter',
          _e: 'Ghost',
          _v: 'v1',
          _u: '2026-01-01T00:00:00.000Z',
          value: 'ignored',
        });

        const before = yield* table.scan({ ConsistentRead: true });

        const reports = yield* registry
          .migrateStream({ entities: ['Settings'] })
          .pipe(Stream.runCollect);
        const finalReport = reports.at(-1);

        expect(finalReport).toEqual({
          phase: 'completed',
          progress: {
            scanned: 5,
            total: expect.any(Number),
            percent: expect.any(Number),
            approximate: true,
          },
          items: {
            scanned: 5,
            ignored: 4,
            migrate: 0,
            migrated: 0,
            failed: 0,
          },
          issues: {
            warnings: 0,
            errors: 0,
          },
          entities: {
            Settings: {
              scanned: 1,
              ignored: 0,
              migrate: 0,
              migrated: 0,
              failed: 0,
              issues: {
                warnings: 0,
                errors: 0,
              },
              drift: emptyDrift(),
            },
          },
          segments: {
            '0': {
              scanned: 5,
              complete: true,
            },
          },
          failures: [],
        });

        const after = yield* table.scan({ ConsistentRead: true });
        expect(sortedRows(after.Items)).toEqual(sortedRows(before.Items));
      }),
  );

  itEffect('scans every segment when scan.totalSegments is configured', () =>
    Effect.gen(function* () {
      for (let index = 0; index < 24; index += 1) {
        yield* Account.insert({
          accountId: `parallel-${index}`,
          email: `parallel-${index}@example.com`,
          status: 'active',
        });
      }
      yield* table.putItem({
        pk: 'IgnoredParallel',
        sk: 'IgnoredParallel',
        _e: 'Ghost',
        _v: 'v1',
        _u: '2026-01-01T00:00:00.000Z',
        value: 'ignored',
      });

      const reports = yield* registry
        .migrateStream({ scan: { totalSegments: 3 } })
        .pipe(Stream.runCollect);
      const finalReport = reports.at(-1);

      expect(finalReport).toMatchObject({
        phase: 'completed',
        items: {
          scanned: 25,
          ignored: 1,
        },
        segments: {
          '0': { complete: true },
          '1': { complete: true },
          '2': { complete: true },
        },
      });

      const segmentScanned = Object.values(finalReport?.segments ?? {}).reduce(
        (total, segment) => total + segment.scanned,
        0,
      );
      expect(segmentScanned).toBe(25);
      expect(finalReport?.segments).toEqual({
        '0': {
          scanned: expect.any(Number),
          complete: true,
        },
        '1': {
          scanned: expect.any(Number),
          complete: true,
        },
        '2': {
          scanned: expect.any(Number),
          complete: true,
        },
      });
    }),
  );

  itEffect('completes with failures when one scan segment is exhausted', () =>
    Effect.gen(function* () {
      for (let index = 0; index < 24; index += 1) {
        yield* Account.insert({
          accountId: `scan-failure-${index}`,
          email: `scan-failure-${index}@example.com`,
          status: 'active',
        });
      }

      const client = createDynamoDB(localConfig);
      const failingClient = {
        ...client,
        scan: (input: Record<string, unknown>) =>
          client.scan(
            input.Segment === 1
              ? {
                  ...input,
                  TableName: `${TEST_TABLE_NAME}-missing`,
                }
              : input,
          ),
      };
      const failingLayer = Layer.succeed(DynamoDB, {
        client: failingClient,
        tableName: TEST_TABLE_NAME,
      });
      const FailingAccount = DynamoEntity.make(table)
        .eschema(accountSchema)
        .primary({ pk: ['accountId'] })
        .index('GSI1', 'byEmail', { pk: ['email'] })
        .build();
      const failingRegistry = EntityRegistry.make(table)
        .register(FailingAccount)
        .build();

      const reports = yield* failingRegistry
        .migrateStream({
          scan: { totalSegments: 3 },
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect, Effect.provide(failingLayer));
      const finalReport = reports.at(-1);

      expect(finalReport).toMatchObject({
        phase: 'completed-with-failures',
        items: {
          failed: 1,
        },
        segments: {
          '0': { complete: true },
          '1': { complete: false },
          '2': { complete: true },
        },
      });
      expect(finalReport?.items.scanned).toBeGreaterThan(0);
      expect(finalReport?.items.scanned).toBeLessThan(24);
      expect(finalReport).not.toHaveProperty('scanPageFailures');
      expect(finalReport).not.toHaveProperty('segmentFailures');
      expect(finalReport).not.toHaveProperty('samples');
      expect(finalReport).not.toHaveProperty('errors');
    }),
  );

  itEffect('uses an explicit progress.estimatedTotal value', () =>
    Effect.gen(function* () {
      yield* Account.insert({
        accountId: 'estimate-0',
        email: 'estimate-0@example.com',
        status: 'active',
      });
      yield* Account.insert({
        accountId: 'estimate-1',
        email: 'estimate-1@example.com',
        status: 'active',
      });

      const reports = yield* registry
        .migrateStream({ progress: { estimatedTotal: 10 } })
        .pipe(Stream.runCollect);

      expect(reports.at(-1)?.progress).toEqual({
        scanned: 2,
        total: 10,
        percent: 20,
      });
    }),
  );

  itEffect(
    'omits progress and table describe when progress estimates are disabled',
    () =>
      Effect.gen(function* () {
        yield* Account.insert({
          accountId: 'estimate-disabled',
          email: 'estimate-disabled@example.com',
          status: 'active',
        });

        const observed: { describes: unknown[] } = { describes: [] };
        const { registry: observedRegistry, layer: observedLayer } =
          makeObservedRegistry(observed);

        const reports = yield* observedRegistry
          .migrateStream({ progress: { estimatedTotal: false } })
          .pipe(Stream.runCollect, Effect.provide(observedLayer));

        expect(reports.at(-1)?.progress).toBeUndefined();
        expect(observed.describes).toEqual([]);
      }),
  );

  itEffect(
    'uses table describe for an approximate progress estimate by default',
    () =>
      Effect.gen(function* () {
        yield* Account.insert({
          accountId: 'estimate-default-0',
          email: 'estimate-default-0@example.com',
          status: 'active',
        });
        yield* Account.insert({
          accountId: 'estimate-default-1',
          email: 'estimate-default-1@example.com',
          status: 'active',
        });

        const observed: { describes: unknown[] } = { describes: [] };
        const { registry: observedRegistry, layer: observedLayer } =
          makeObservedRegistry(observed);

        const reports = yield* observedRegistry
          .migrateStream()
          .pipe(Stream.runCollect, Effect.provide(observedLayer));

        expect(observed.describes).toHaveLength(1);
        expect(reports.at(-1)?.progress).toEqual({
          scanned: 2,
          total: expect.any(Number),
          percent: expect.any(Number),
          approximate: true,
        });
      }),
  );

  itEffect(
    'omits DynamoDB scan Limit when scan.pageLimit is not configured',
    () =>
      Effect.gen(function* () {
        yield* Account.insert({
          accountId: 'page-limit-omitted',
          email: 'page-limit-omitted@example.com',
          status: 'active',
        });

        const observed: { scans: unknown[] } = { scans: [] };
        const { registry: observedRegistry, layer: observedLayer } =
          makeObservedRegistry(observed);

        yield* observedRegistry
          .migrateStream({ progress: { estimatedTotal: false } })
          .pipe(Stream.runCollect, Effect.provide(observedLayer));

        expect(observed.scans.length).toBeGreaterThan(0);
        expect(
          observed.scans.every(
            (scan) => !Object.hasOwn(scan as Record<string, unknown>, 'Limit'),
          ),
        ).toBe(true);
      }),
  );

  itEffect('honors scan.pageLimit on DynamoDB scan requests', () =>
    Effect.gen(function* () {
      for (let index = 0; index < 3; index += 1) {
        yield* Account.insert({
          accountId: `page-limit-${index}`,
          email: `page-limit-${index}@example.com`,
          status: 'active',
        });
      }

      const observed: { scans: unknown[] } = { scans: [] };
      const { registry: observedRegistry, layer: observedLayer } =
        makeObservedRegistry(observed);

      const reports = yield* observedRegistry
        .migrateStream({
          scan: { pageLimit: 1 },
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect, Effect.provide(observedLayer));

      expect(reports.at(-1)?.items.scanned).toBe(3);
      expect(observed.scans.length).toBeGreaterThan(1);
      expect(
        observed.scans.every(
          (scan) => (scan as Record<string, unknown>).Limit === 1,
        ),
      ).toBe(true);
    }),
  );

  itEffect('applies scan.consistentRead to base table scans', () =>
    Effect.gen(function* () {
      yield* Account.insert({
        accountId: 'consistent-read',
        email: 'consistent-read@example.com',
        status: 'active',
      });

      const observed: { scans: unknown[] } = { scans: [] };
      const { registry: observedRegistry, layer: observedLayer } =
        makeObservedRegistry(observed);

      yield* observedRegistry
        .migrateStream({
          scan: { consistentRead: true },
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect, Effect.provide(observedLayer));

      expect(observed.scans.length).toBeGreaterThan(0);
      expect(
        observed.scans.every(
          (scan) => (scan as Record<string, unknown>).ConsistentRead === true,
        ),
      ).toBe(true);
    }),
  );

  itEffect('limits item processing concurrency within a segment', () =>
    Effect.gen(function* () {
      for (let index = 0; index < 6; index += 1) {
        yield* Account.insert({
          accountId: `concurrency-${index}`,
          email: `concurrency-${index}@example.com`,
          status: 'active',
        });
      }

      const ObservedAccount = DynamoEntity.make(table)
        .eschema(accountSchema)
        .primary({ pk: ['accountId'] })
        .index('GSI1', 'byEmail', { pk: ['email'] })
        .build();
      const inspectMigration =
        ObservedAccount.inspectMigration.bind(ObservedAccount);
      let active = 0;
      let maxActive = 0;
      const SlowAccount = new Proxy(ObservedAccount, {
        get(target, property) {
          if (property === 'inspectMigration') {
            return (item: Record<string, unknown>) =>
              Effect.gen(function* () {
                active += 1;
                maxActive = Math.max(maxActive, active);
                yield* Effect.sleep('20 millis');
                const inspection = yield* inspectMigration(item);
                active -= 1;
                return inspection;
              });
          }
          return Reflect.get(target, property, target);
        },
      }) as typeof ObservedAccount;
      const observedRegistry = EntityRegistry.make(table)
        .register(SlowAccount)
        .build();

      const reports = yield* observedRegistry
        .migrateStream({
          concurrency: { itemsPerSegment: 2 },
          progress: { estimatedTotal: false },
        })
        .pipe(Stream.runCollect);

      expect(reports.at(-1)?.items.scanned).toBe(6);
      expect(maxActive).toBe(2);
    }),
  );
});
