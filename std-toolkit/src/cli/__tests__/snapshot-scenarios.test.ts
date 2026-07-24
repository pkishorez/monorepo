import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Schema, SchemaTransformation } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import type {
  ESchemaDefinition,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableSnapshot,
} from '../../snapshot/index.js';
import { runSnapshotCommand } from '../snapshot-command.js';

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

const transformedUser = EntityESchema.make('User', 'id', {
  email: Schema.StringFromBase64,
  profile: Schema.Struct({
    displayName: Schema.String,
    tags: Schema.Array(Schema.String),
    address: Schema.Struct({
      city: Schema.String,
      country: Schema.String,
    }),
  }),
}).build();

const customTransformedUser = EntityESchema.make('User', 'id', {
  email: Schema.String.pipe(
    Schema.decodeTo(
      Schema.Number,
      SchemaTransformation.transform({ decode: Number, encode: String }),
    ),
  ),
  profile: Schema.Struct({
    displayName: Schema.String,
    tags: Schema.Array(Schema.String),
    address: Schema.Struct({
      city: Schema.String,
      country: Schema.String,
    }),
  }),
}).build();

function entity(
  secondaryDerivations: TableEntitySnapshot['secondaryDerivations'] = [],
): TableEntitySnapshot {
  return {
    name: 'User',
    kind: 'keyed',
    idField: 'id',
    schema: 'User',
    primaryDerivation: { pk: ['email'], sk: ['id'] },
    secondaryDerivations,
  };
}

function index(
  overrides: Partial<TableIndexSnapshot> = {},
): TableIndexSnapshot {
  return {
    name: 'GSI1',
    kind: 'gsi',
    pk: 'gsi1pk',
    sk: 'gsi1sk',
    ...overrides,
  };
}

function table(options?: {
  readonly adapter?: TableSnapshot['adapter'];
  readonly primaryIndex?: TableSnapshot['primaryIndex'];
  readonly secondaryIndexes?: TableSnapshot['secondaryIndexes'];
  readonly entities?: TableSnapshot['entities'];
  readonly schemas?: readonly ESchemaDefinition[];
}): TableSnapshot {
  return {
    _v: 'v1',
    kind: 'table',
    adapter: options?.adapter ?? 'dynamodb',
    primaryIndex: options?.primaryIndex ?? { pk: 'pk', sk: 'sk' },
    secondaryIndexes: options?.secondaryIndexes ?? [],
    entities: options?.entities ?? [entity()],
    schemas: options?.schemas ?? userV1.snapshot().schemas,
  };
}

function emptyTable(): TableSnapshot {
  return table({ entities: [], schemas: [] });
}

const indexedEntity = entity([
  {
    name: 'byEmail',
    physicalIndex: 'GSI1',
    pk: ['email'],
    sk: ['id'],
  },
]);

interface Scenario {
  readonly name: string;
  readonly baseline?: TableSnapshot;
  readonly current: TableSnapshot;
  readonly exitCode: number;
  readonly update?: boolean;
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
    update: true,
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
    current: table({ primaryIndex: { pk: 'partitionKey', sk: 'sortKey' } }),
    exitCode: 1,
  },
  {
    name: 'secondary-index-added',
    baseline: table(),
    current: table({
      secondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    exitCode: 1,
  },
  {
    name: 'secondary-index-changed',
    baseline: table({
      secondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    current: table({
      secondaryIndexes: [index({ pk: 'nextGsiPk', sk: 'nextGsiSk' })],
      entities: [indexedEntity],
    }),
    exitCode: 1,
  },
  {
    name: 'secondary-index-change-approved',
    baseline: table({
      secondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    current: table({
      secondaryIndexes: [index({ pk: 'nextGsiPk', sk: 'nextGsiSk' })],
      entities: [indexedEntity],
    }),
    exitCode: 0,
    update: true,
  },
  {
    name: 'secondary-index-removed',
    baseline: table({
      secondaryIndexes: [index()],
      entities: [indexedEntity],
    }),
    current: table(),
    exitCode: 1,
  },
  {
    name: 'complex-field-added-safely',
    baseline: table(),
    current: table({ schemas: userV2.snapshot().schemas }),
    exitCode: 1,
  },
  {
    name: 'approved-complex-field-edited',
    baseline: table(),
    current: table({ schemas: userEditedV1.snapshot().schemas }),
    exitCode: 1,
  },
  {
    name: 'transformation-changed',
    baseline: table(),
    current: table({ schemas: transformedUser.snapshot().schemas }),
    exitCode: 1,
  },
  {
    name: 'adapter-changed',
    baseline: table(),
    current: table({ adapter: 'sqlite' }),
    exitCode: 1,
  },
  {
    name: 'unverifiable-transform-warning',
    baseline: table({ schemas: customTransformedUser.snapshot().schemas }),
    current: table({ schemas: customTransformedUser.snapshot().schemas }),
    exitCode: 0,
  },
];

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
  const output: string[] = [];
  const exitCode = await runSnapshotCommand({
    cwd,
    update: scenario.update ?? false,
    write: (value) => output.push(value),
  });
  return { exitCode, output: `${output.join('\n')}\n` };
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
      expect(result.output.split('\n')[0]).toBe(
        scenario.update === true
          ? scenario.baseline === undefined
            ? '✓ Approved snapshot written to std-toolkit.snapshot.json'
            : '✓ Approved snapshot updated: std-toolkit.snapshot.json'
          : scenario.baseline === undefined
            ? 'No approved snapshot found: std-toolkit.snapshot.json'
            : scenario.exitCode === 0
              ? '✓ Database contract matches the approved snapshot'
              : '╭─ DATABASE CONTRACT CHANGED ────────────────────╮',
      );
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
