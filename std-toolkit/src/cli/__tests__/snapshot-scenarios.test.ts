import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import type {
  ESchemaDefinition,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableSnapshot,
} from '../../snapshot/index.js';
import { Snapshot } from '../../snapshot/index.js';
import { Effect } from 'effect';
import * as NodeServices from '@effect/platform-node/NodeServices';
import {
  approveSnapshot,
  renderSnapshotResult,
  type SnapshotCommandResult,
  verifySnapshot,
} from '../snapshot/index.js';

const directories: string[] = [];

const userV1 = EntityESchema.make('User', 'id', {
  email: Schema.String,
  profile: Schema.Struct({
    displayName: Schema.String,
    tags: Schema.Array(Schema.String),
    address: Schema.Struct({
      city: Schema.String,
      country: Schema.String,
    }),
  }),
}).build();

const userV2 = EntityESchema.make('User', 'id', {
  email: Schema.String,
  profile: Schema.Struct({
    displayName: Schema.String,
    tags: Schema.Array(Schema.String),
    address: Schema.Struct({
      city: Schema.String,
      country: Schema.String,
    }),
  }),
})
  .evolve(
    'v2',
    {
      preferences: Schema.Struct({
        theme: Schema.Literals(['light', 'dark', 'system']),
        notifications: Schema.Struct({
          email: Schema.Boolean,
          push: Schema.Boolean,
        }),
      }),
    },
    (value) => ({
      ...value,
      preferences: {
        theme: 'system' as const,
        notifications: { email: true, push: true },
      },
    }),
  )
  .build();

const userEditedV1 = EntityESchema.make('User', 'id', {
  email: Schema.String,
  profile: Schema.Struct({
    displayName: Schema.String,
    tags: Schema.Array(Schema.String),
    address: Schema.Struct({
      city: Schema.String,
      country: Schema.String,
    }),
  }),
  preferences: Schema.Struct({
    theme: Schema.Literals(['light', 'dark', 'system']),
    notifications: Schema.Struct({
      email: Schema.Boolean,
      push: Schema.Boolean,
    }),
  }),
}).build();

function entity(
  patterns: readonly TableEntitySnapshot['accessPatterns'][number][] = [],
): TableEntitySnapshot {
  return {
    name: 'User',
    kind: 'keyed',
    schema: 'User',
    idField: 'id',
    primary: { pk: ['email'], sk: ['id'] },
    accessPatterns: [
      ...patterns,
      { name: 'primary', kind: 'primary', pk: ['email'], sk: ['id'] },
    ],
  };
}

function index(
  overrides: Partial<TableIndexSnapshot> = {},
): TableIndexSnapshot {
  return {
    name: 'GSI1',
    pk: 'gsi1pk',
    sk: 'gsi1sk',
    ...overrides,
  };
}

function table(options?: {
  readonly logicalName?: string;
  readonly primary?: TableSnapshot['topology']['primary'];
  readonly globalSecondaryIndexes?: readonly TableIndexSnapshot[];
  readonly entities?: TableSnapshot['entities'];
  readonly schemas?: readonly ESchemaDefinition[];
}): TableSnapshot {
  return {
    _v: 'v2',
    kind: 'table',
    logicalName: options?.logicalName ?? 'app',
    topology: {
      primary: options?.primary ?? { pk: 'pk', sk: 'sk' },
      localSecondaryIndexes: [],
      globalSecondaryIndexes: options?.globalSecondaryIndexes ?? [],
    },
    entities: options?.entities ?? [entity()],
    schemas: options?.schemas ?? Snapshot.capture(userV1).schemas,
  };
}

function emptyTable(): TableSnapshot {
  return table({ entities: [], schemas: [] });
}

const indexedEntity = entity([
  {
    name: 'byEmail',
    kind: 'gsi',
    index: 'GSI1',
    pk: ['email'],
    sk: ['id'],
  },
]);

interface Scenario {
  readonly name: string;
  readonly baseline?: TableSnapshot;
  readonly current: TableSnapshot;
  readonly exitCode: number;
  readonly mode?: 'verify' | 'approve';
}

const scenarios: readonly Scenario[] = [
  {
    name: 'new-table',
    current: table(),
    exitCode: 1,
  },
  {
    name: 'unchanged-table',
    baseline: table(),
    current: table(),
    exitCode: 0,
  },
  {
    name: 'new-table-approved',
    current: table(),
    exitCode: 0,
    mode: 'approve',
  },
  {
    name: 'entity-added',
    baseline: emptyTable(),
    current: table(),
    exitCode: 1,
  },
  {
    name: 'entity-removed',
    baseline: table(),
    current: emptyTable(),
    exitCode: 1,
  },
  {
    name: 'primary-index-changed',
    baseline: table(),
    current: table({ primary: { pk: 'partitionKey', sk: 'sortKey' } }),
    exitCode: 1,
  },
  {
    name: 'secondary-index-added',
    baseline: table(),
    current: table({
      globalSecondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    exitCode: 1,
  },
  {
    name: 'secondary-index-changed',
    baseline: table({
      globalSecondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    current: table({
      globalSecondaryIndexes: [index({ pk: 'nextGsiPk', sk: 'nextGsiSk' })],
      entities: [indexedEntity],
    }),
    exitCode: 1,
  },
  {
    name: 'secondary-index-change-approved',
    baseline: table({
      globalSecondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    current: table({
      globalSecondaryIndexes: [index({ pk: 'nextGsiPk', sk: 'nextGsiSk' })],
      entities: [indexedEntity],
    }),
    exitCode: 0,
    mode: 'approve',
  },
  {
    name: 'secondary-index-removed',
    baseline: table({
      globalSecondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    current: table(),
    exitCode: 1,
  },
  {
    name: 'complex-field-added-safely',
    baseline: table(),
    current: table({ schemas: Snapshot.capture(userV2).schemas }),
    exitCode: 1,
  },
  {
    name: 'approved-complex-field-edited',
    baseline: table(),
    current: table({ schemas: Snapshot.capture(userEditedV1).schemas }),
    exitCode: 1,
  },
  {
    name: 'table-renamed',
    baseline: table(),
    current: table({ logicalName: 'legacy' }),
    exitCode: 1,
  },
];

function expectedFirstLine(scenario: Scenario): string {
  if (scenario.mode === 'approve') {
    return scenario.baseline === undefined
      ? 'APPROVED  std-toolkit.snapshot.json'
      : `APPROVED  ${Snapshot.diff(scenario.baseline, scenario.current).length} snapshot ${Snapshot.diff(scenario.baseline, scenario.current).length === 1 ? 'change' : 'changes'}`;
  }
  if (scenario.baseline === undefined) {
    return 'FAIL  No approved snapshot found';
  }
  return scenario.exitCode === 0
    ? 'PASS  Snapshot matches'
    : `FAIL  ${Snapshot.diff(scenario.baseline, scenario.current).length} snapshot ${Snapshot.diff(scenario.baseline, scenario.current).length === 1 ? 'change needs' : 'changes need'} approval`;
}

async function runScenario(
  scenario: Scenario,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const cwd = await mkdtemp(join(tmpdir(), 'std-toolkit-cli-scenario-'));
  directories.push(cwd);
  await writeFile(
    join(cwd, 'std-toolkit.snapshot.ts'),
    `export default ${JSON.stringify(scenario.current)};\n`,
  );
  if (scenario.baseline !== undefined) {
    await writeFile(
      join(cwd, 'std-toolkit.snapshot.json'),
      `${JSON.stringify(scenario.baseline, null, 2)}\n`,
    );
  }
  const commandResult: SnapshotCommandResult =
    scenario.mode === 'approve'
      ? await Effect.runPromise(
          approveSnapshot(cwd).pipe(Effect.provide(NodeServices.layer)),
        )
      : await Effect.runPromise(
          verifySnapshot(cwd).pipe(Effect.provide(NodeServices.layer)),
        );
  const { exitCode, output } = renderSnapshotResult(commandResult);
  return { exitCode, output: `${output}\n` };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('snapshot CLI scenario transcripts', () => {
  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      const result = await runScenario(scenario);
      expect(result.exitCode).toBe(scenario.exitCode);
      expect(result.output.split('\n')[0]).toBe(expectedFirstLine(scenario));
      await expect(result.output).toMatchFileSnapshot(
        join(
          import.meta.dirname,
          'fixtures',
          'snapshot-scenarios',
          scenario.name,
          'output.txt',
        ),
      );
    });
  }
});
