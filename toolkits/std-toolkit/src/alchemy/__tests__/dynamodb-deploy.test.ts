import { Effect, Layer, Redacted, Schema } from 'effect';
import { AWSEnvironment } from '@alchemy.run/aws';
import type { ProviderService } from 'alchemy/Provider';
import { describe, expect, it } from 'vitest';
import { DynamoDB as DynamoDBAdapter } from '../../db/dynamodb/index.js';
import { StdTable } from '../../db/index.js';
import {
  StdTableService,
  type StoredItem,
} from '../../db/std-table/contract/index.js';
import {
  readStoredSnapshot,
  type StoredSnapshot,
  type TableMode,
} from '../../db/table-snapshot/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { snapshotProps } from '../dynamodb/dynamodb.js';
import {
  SnapshotCheck,
  SnapshotCheckProvider,
  SnapshotRecord,
  SnapshotRecordProvider,
  type TableSnapshotProps,
} from '../dynamodb/snapshot.js';

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const required = process.env.REQUIRE_DYNAMODB_LOCAL === 'true';

if (endpoint === undefined && required)
  throw new Error(
    'DYNAMODB_LOCAL_ENDPOINT is required when REQUIRE_DYNAMODB_LOCAL=true',
  );

// ─── The code, at each release ──────────────────────────────────────────────

interface Release {
  /** Task gains a v2 with a `done` flag: additive. */
  readonly taskV2?: boolean;
  /** Task v1's title becomes a number: breaking. */
  readonly breaking?: boolean;
  /** The order the table declares its local secondary indexes in. */
  readonly localIndexes?: readonly ('LSI1' | 'LSI2')[];
  /** The global secondary indexes, each `[name, pk, sk]`. */
  readonly globalIndexes?: readonly (readonly [string, string, string])[];
}

const tasks = (release: Release = {}) => {
  let builder = StdTable.make('tasks').primary('pk', 'sk');
  for (const name of release.localIndexes ?? [])
    builder = builder.lsi(name, `${name}SK`);
  for (const [name, pk, sk] of release.globalIndexes ?? [])
    builder = builder.gsi(name, pk, sk);
  const table = builder.build();
  const v1 = EntityESchema.make('Task', 'taskId', {
    title: release.breaking
      ? (Schema.Finite as unknown as Schema.Codec<string, string>)
      : Schema.String,
  });
  table
    .entity(
      release.taskV2
        ? v1
            .evolve('v2', { done: Schema.Boolean }, (task) => ({
              ...task,
              done: false,
            }))
            .build()
        : v1.build(),
    )
    .primary()
    .build();
  return table;
};

const withGSI1 = { globalIndexes: [['GSI1', 'GSI1PK', 'GSI1SK']] } as const;

// ─── Alchemy, faked ─────────────────────────────────────────────────────────

// The AWS environment Alchemy's AWS providers deploy with, at DynamoDB Local.
const environment = Layer.succeed(
  AWSEnvironment,
  Effect.succeed({
    accountId: '000000000000',
    region: 'local',
    endpoint: endpoint ?? '',
    credentials: Effect.succeed({
      accessKeyId: Redacted.make('local'),
      secretAccessKey: Redacted.make('local'),
      sessionToken: undefined,
      region: 'local',
    }),
  }),
);

const providers = Effect.gen(function* () {
  return {
    check: yield* SnapshotCheck.Provider,
    record: yield* SnapshotRecord.Provider,
  };
}).pipe(
  Effect.provide(
    Layer.mergeAll(SnapshotCheckProvider(), SnapshotRecordProvider()),
  ),
);

/** What a stage's Alchemy state keeps: each resource's last accepted props. */
interface Stage {
  check?: TableSnapshotProps;
  tableTouched: number;
  record?: TableSnapshotProps;
}

const newStage = (): Stage => ({ tableTouched: 0 });

let tableNumber = 0;
const newTableName = () => `dynamodb-deploy-${process.pid}-${++tableNumber}`;

const configFor = (tableName: string) => ({
  tableName,
  region: 'local',
  endpoint: endpoint!,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

// As Alchemy runs a resource: reconciled when it is new or its props differ
// from the ones its state keeps, which it then keeps.
const apply = (
  stage: Stage,
  key: 'check' | 'record',
  news: TableSnapshotProps,
) =>
  Effect.gen(function* () {
    // The two take the same props.
    const provider = (yield* providers)[key] as ProviderService<SnapshotCheck>;
    const olds = stage[key];
    if (olds !== undefined) {
      const diff = yield* provider.diff!({ olds, news } as never);
      if (diff?.action === 'noop') return;
    }
    yield* provider.reconcile({
      id: key,
      fqn: key,
      instanceId: key,
      news,
      olds,
      output: olds,
      session: undefined as never,
      bindings: [],
    });
    stage[key] = news;
  });

/**
 * One deploy of `DynamoDB.table`, in the order its outputs give it: the
 * check, Alchemy's table, then the record. Alchemy's table is created when it
 * is missing; it changes nothing the snapshot items live in.
 */
const deploy = (
  stage: Stage,
  code: ReturnType<typeof tasks>,
  options: {
    readonly tableName: string;
    readonly mode?: TableMode;
    /** The deploy stops once the table is changed, before the record. */
    readonly stopAfterTable?: boolean;
  },
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const props = yield* snapshotProps({
        table: code,
        tableName: options.tableName,
        mode: options.mode ?? 'persistent',
      });
      yield* apply(stage, 'check', props);
      stage.tableTouched++;
      yield* DynamoDBAdapter.createTable(code, configFor(options.tableName));
      if (options.stopAfterTable === true) return;
      yield* apply(stage, 'record', props);
    }).pipe(Effect.provide(environment)),
  );

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the deploy to be refused');
    },
    (cause: unknown) => cause as { readonly _tag: string; reason: string },
  );

// ─── The live table ─────────────────────────────────────────────────────────

const contract = (tableName: string) =>
  Effect.gen(function* () {
    return (yield* StdTableService('tasks')).contract;
  }).pipe(
    Effect.provide(DynamoDBAdapter.make(tasks(), configFor(tableName)).layer),
  );

const storedItems = (tableName: string) =>
  Effect.runPromise(
    contract(tableName).pipe(Effect.flatMap(readStoredSnapshot)),
  );

/** Every internal item, by key, to the `_u` of its last write. */
const versions = (stored: StoredSnapshot) =>
  Object.fromEntries(
    [stored.snapshot, ...stored.entities, ...stored.versions]
      .filter((item) => item !== null)
      .map((item) => [item.sk, item.meta._u]),
  );

/** Writes one internal item over, as no setup would. */
const rewrite = (
  tableName: string,
  sk: string,
  data: (data: StoredItem['data']) => StoredItem['data'],
) =>
  Effect.runPromise(
    contract(tableName).pipe(
      Effect.flatMap((table) =>
        readStoredSnapshot(table).pipe(
          Effect.flatMap((stored) => {
            const item = [
              stored.snapshot,
              ...stored.entities,
              ...stored.versions,
            ].find((each) => each?.sk === sk)!;
            return table.writeItem({
              item: { ...item, data: data(item.data) },
              condition: { kind: 'updated', value: item.meta._u },
            });
          }),
        ),
      ),
    ),
  );

const storedVersionIds = async (tableName: string) =>
  (await storedItems(tableName)).versions
    .filter((item) => !item.meta._d)
    .map(({ sk }) => sk);

const insertTask = (tableName: string) => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const task = table
    .entity(
      EntityESchema.make('Task', 'taskId', { title: Schema.String }).build(),
    )
    .primary()
    .build();
  return Effect.runPromise(
    task
      .insert({ taskId: 't1', title: 'kept' })
      .pipe(
        Effect.provide(DynamoDBAdapter.make(table, configFor(tableName)).layer),
      ),
  );
};

const countTasks = (tableName: string) =>
  Effect.runPromise(
    contract(tableName).pipe(
      Effect.flatMap((table) => table.scanItems({ limit: 100 })),
      Effect.map(
        ({ items }) => items.filter((item) => item.meta._e === 'Task').length,
      ),
    ),
  );

// ─── The deploys ────────────────────────────────────────────────────────────

describe.skipIf(endpoint === undefined)('DynamoDB.table at deploy', () => {
  it('records the first snapshot once the new table exists', async () => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(), { tableName });
    const stored = await storedItems(tableName);
    expect(stored.snapshot?.data).toMatchObject({
      logicalName: 'tasks',
      mode: 'persistent',
    });
    expect(await storedVersionIds(tableName)).toContain('Task@v1');
  });

  it('writes nothing on an unchanged redeploy', async () => {
    const tableName = newTableName();
    await deploy(newStage(), tasks(), { tableName });
    const before = versions(await storedItems(tableName));
    // A fresh stage runs both resources again; neither changes an item.
    await deploy(newStage(), tasks(), { tableName });
    expect(versions(await storedItems(tableName))).toEqual(before);
  });

  it('takes an unchanged redeploy on __snapshot alone, in both resources', async () => {
    const tableName = newTableName();
    await deploy(newStage(), tasks(), { tableName });
    // A version item neither resource could read, under the code's hash:
    // only a check that reads it would refuse the deploy.
    await rewrite(tableName, 'Task@v1', () => ({ _v: 'v1', id: 7 }));
    await deploy(newStage(), tasks(), { tableName });

    await rewrite(tableName, 'single', (data) => ({ ...data, hash: null }));
    expect(
      await refusal(deploy(newStage(), tasks(), { tableName })),
    ).toMatchObject({
      _tag: 'SetupRefused',
      reason: 'unreadable',
    });
  });

  it('passes an additive change and writes only the new items, and __snapshot for its hash', async () => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(), { tableName });
    const before = versions(await storedItems(tableName));
    const hash = (await storedItems(tableName)).snapshot?.data.hash;
    await deploy(stage, tasks({ taskV2: true }), { tableName });
    const stored = await storedItems(tableName);
    const after = versions(stored);
    const written = Object.keys(after).filter(
      (key) => after[key] !== before[key],
    );
    expect(written).toEqual([
      'single',
      ...Object.keys(after).filter((key) => before[key] === undefined),
    ]);
    expect(written.some((key) => key.endsWith('Task@v2'))).toBe(true);
    expect(stored.snapshot?.data.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.snapshot?.data.hash).not.toBe(hash);
  });

  it('refuses a breaking change before the table is touched, and keeps its rows', async () => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(), { tableName });
    await insertTask(tableName);
    const before = await storedItems(tableName);
    const touched = stage.tableTouched;

    const refused = await refusal(
      deploy(stage, tasks({ breaking: true }), { tableName }),
    );
    expect(refused).toMatchObject({ _tag: 'SetupRefused', reason: 'breaking' });
    expect(stage.tableTouched).toBe(touched);
    expect(await storedItems(tableName)).toEqual(before);
    expect(await countTasks(tableName)).toBe(1);
  });

  it('refuses a breaking change with the Alchemy state lost, against the snapshot the table keeps', async () => {
    const tableName = newTableName();
    await deploy(newStage(), tasks(), { tableName });
    const refused = await refusal(
      deploy(newStage(), tasks({ breaking: true }), { tableName }),
    );
    expect(refused).toMatchObject({ _tag: 'SetupRefused', reason: 'breaking' });
  });

  it('passes adding a global secondary index', async () => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(), { tableName });
    await deploy(stage, tasks(withGSI1), { tableName });
    expect((await storedItems(tableName)).snapshot?.data).toMatchObject({
      globalSecondaryIndexes: [{ name: 'GSI1', pk: 'GSI1PK', sk: 'GSI1SK' }],
    });
  });

  it.each([
    ['removing a global secondary index', withGSI1, {}],
    [
      'a new key on a global secondary index',
      withGSI1,
      { globalIndexes: [['GSI1', 'GSI1PK', 'OTHERSK']] },
    ],
    ['adding a local secondary index', {}, { localIndexes: ['LSI1'] }],
    [
      'removing a local secondary index',
      { localIndexes: ['LSI1'] },
      { localIndexes: [] },
    ],
  ] as const)('refuses %s', async (_, from, to) => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(from as Release), { tableName });
    const refused = await refusal(
      deploy(stage, tasks(to as Release), { tableName }),
    );
    expect(refused).toMatchObject({ reason: 'replaces-table' });
  });

  it('refuses a new order of the local secondary indexes, kept in __snapshot', async () => {
    const tableName = newTableName();
    await deploy(newStage(), tasks({ localIndexes: ['LSI1', 'LSI2'] }), {
      tableName,
    });
    expect((await storedItems(tableName)).snapshot?.data).toMatchObject({
      localSecondaryIndexes: [{ name: 'LSI1' }, { name: 'LSI2' }],
    });
    // A fresh stage: only the stored order can refuse it.
    const refused = await refusal(
      deploy(newStage(), tasks({ localIndexes: ['LSI2', 'LSI1'] }), {
        tableName,
      }),
    );
    expect(refused).toMatchObject({ reason: 'replaces-table' });
  });

  it('refuses a new physical name under the same resource', async () => {
    const stage = newStage();
    await deploy(stage, tasks(), { tableName: newTableName() });
    const refused = await refusal(
      deploy(stage, tasks(), { tableName: newTableName() }),
    );
    expect(refused).toMatchObject({ reason: 'renames-table' });
  });

  it('never wipes a disposable table, refusing the change instead', async () => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(), { tableName, mode: 'disposable' });
    await insertTask(tableName);
    const refused = await refusal(
      deploy(stage, tasks({ breaking: true }), {
        tableName,
        mode: 'disposable',
      }),
    );
    expect(refused).toMatchObject({ reason: 'replaces-table' });
    expect(await countTasks(tableName)).toBe(1);
  });

  it('refuses a persistent table becoming disposable', async () => {
    const tableName = newTableName();
    const stage = newStage();
    await deploy(stage, tasks(), { tableName });
    const refused = await refusal(
      deploy(stage, tasks(), { tableName, mode: 'disposable' }),
    );
    expect(refused).toMatchObject({ reason: 'mode-change' });
  });

  it('keeps the rows of a table that had none recorded, in either mode', async () => {
    for (const mode of ['persistent', 'disposable'] as const) {
      const tableName = newTableName();
      await Effect.runPromise(
        DynamoDBAdapter.createTable(tasks(), configFor(tableName)),
      );
      await insertTask(tableName);
      await deploy(newStage(), tasks(), { tableName, mode });
      expect(await countTasks(tableName)).toBe(1);
      expect((await storedItems(tableName)).snapshot?.data).toMatchObject({
        mode,
      });
    }
  });

  describe('a table that exists with no snapshot and no Alchemy state', () => {
    const existing = async (from: Release) => {
      const tableName = newTableName();
      await Effect.runPromise(
        DynamoDBAdapter.createTable(tasks(from), configFor(tableName)),
      );
      await insertTask(tableName);
      return tableName;
    };

    it.each([
      [
        'removing a local secondary index',
        { localIndexes: ['LSI1', 'LSI2'] },
        { localIndexes: ['LSI1'] },
      ],
      ['adding a local secondary index', {}, { localIndexes: ['LSI1'] }],
      [
        'a new key on a global secondary index',
        withGSI1,
        { globalIndexes: [['GSI1', 'GSI1PK', 'OTHERSK']] },
      ],
      ['removing a global secondary index', withGSI1, {}],
    ] as const)(
      'refuses %s against the live table, before Alchemy touches it',
      async (_, from, to) => {
        const tableName = await existing(from as Release);
        const stage = newStage();
        const refused = await refusal(
          deploy(stage, tasks(to as Release), { tableName }),
        );
        expect(refused).toMatchObject({ reason: 'replaces-table' });
        expect(stage.tableTouched).toBe(0);
        expect((await storedItems(tableName)).snapshot).toBeNull();
        expect(await countTasks(tableName)).toBe(1);
      },
    );

    it('passes adding a global secondary index', async () => {
      const tableName = await existing({});
      await deploy(newStage(), tasks(withGSI1), { tableName });
      expect(await countTasks(tableName)).toBe(1);
      expect((await storedItems(tableName)).snapshot?.data).toMatchObject({
        globalSecondaryIndexes: [{ name: 'GSI1', pk: 'GSI1PK', sk: 'GSI1SK' }],
      });
    });

    it('passes local secondary indexes DescribeTable lists in an order of its own', async () => {
      // DynamoDB Local lists these two as LSI2, LSI1.
      const release = { localIndexes: ['LSI1', 'LSI2'] } as const;
      const tableName = await existing(release);
      await deploy(newStage(), tasks(release), { tableName });
      expect((await storedItems(tableName)).snapshot?.data).toMatchObject({
        localSecondaryIndexes: [{ name: 'LSI1' }, { name: 'LSI2' }],
      });
    });
  });

  describe('a deploy stopped between the table and the record', () => {
    it('records on the next deploy, from the older snapshot', async () => {
      const tableName = newTableName();
      const stage = newStage();
      await deploy(stage, tasks(), { tableName });
      await deploy(stage, tasks({ taskV2: true }), {
        tableName,
        stopAfterTable: true,
      });
      expect(await storedVersionIds(tableName)).not.toContain('Task@v2');
      await deploy(stage, tasks({ taskV2: true }), { tableName });
      expect(await storedVersionIds(tableName)).toContain('Task@v2');
    });

    it('still refuses a change breaking the older snapshot', async () => {
      const tableName = newTableName();
      const stage = newStage();
      await deploy(stage, tasks(), { tableName });
      await deploy(stage, tasks({ taskV2: true }), {
        tableName,
        stopAfterTable: true,
      });
      const refused = await refusal(
        deploy(stage, tasks({ breaking: true }), { tableName }),
      );
      expect(refused).toMatchObject({ reason: 'breaking' });
    });

    it('refuses undoing an index the table took but the snapshot never recorded', async () => {
      const tableName = newTableName();
      const stage = newStage();
      await deploy(stage, tasks(), { tableName });
      await deploy(stage, tasks(withGSI1), {
        tableName,
        stopAfterTable: true,
      });
      // The stored snapshot has no GSI1; the table, and the check's state, do.
      const refused = await refusal(deploy(stage, tasks(), { tableName }));
      expect(refused).toMatchObject({ reason: 'replaces-table' });
    });
  });
});
