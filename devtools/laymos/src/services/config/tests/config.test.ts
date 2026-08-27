import { fileURLToPath } from 'node:url';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { ConfigService, ConfigServiceLive } from '../index.js';

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function layerScenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/layers/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

function readFixture(name: string) {
  return Effect.gen(function* () {
    const config = yield* ConfigService;
    return yield* config.read(fixture(name));
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

function readFixtureError(name: string) {
  return Effect.gen(function* () {
    const config = yield* ConfigService;
    return yield* config.read(fixture(name));
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
    Effect.flip,
    Effect.runPromise,
  );
}

function readScenario(name: string) {
  return Effect.gen(function* () {
    const config = yield* ConfigService;
    return yield* config.read(layerScenario(name));
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

function readScenarioError(name: string) {
  return Effect.gen(function* () {
    const config = yield* ConfigService;
    return yield* config.read(layerScenario(name));
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
    Effect.flip,
    Effect.runPromise,
  );
}

describe('ConfigService', () => {
  test('reads and decodes a valid config', async () => {
    const config = await readFixture('valid.json');

    expect(config.sourceRoots).toEqual(['src']);
    expect(config.ignoredPaths).toEqual([]);
    expect(config.layers.app).toEqual({
      paths: ['src/app'],
      description: 'Application',
      modules: { 'src/app': { shared: false, exposed: true } },
      moduleGraphs: {},
    });
    expect(config.layers.domain?.modules).toEqual({
      'src/domain': { shared: false, exposed: true },
    });
    expect(config.layerGraphs.architecture?.rules).toEqual({
      app: ['domain'],
    });
  });

  test('fails with reason "read" for a missing file', async () => {
    const error = await readFixtureError('missing.json');

    expect(error.reason).toBe('read');
  });

  test('fails with reason "parse" for invalid JSON', async () => {
    const error = await readFixtureError('invalid-json.txt');

    expect(error.reason).toBe('parse');
  });

  test('fails with reason "schema" when layers is empty', async () => {
    const error = await readFixtureError('invalid-schema.json');

    expect(error.reason).toBe('schema');
  });

  test('allows an empty LayerGraph set', async () => {
    const config = await readScenario('forbidden-sibling-import');

    expect(config.layerGraphs).toEqual({});
  });

  test('collects every invalid canonical path', async () => {
    const error = await readScenarioError('invalid-paths');

    expect(error.reason).toBe('validation');
    expect(error.issues.map((issue) => issue.kind)).toEqual([
      'path',
      'path',
      'path',
      'path',
      'path',
      'path',
      'path',
    ]);
    expect(error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'layers.app.docsPath must be a canonical project-relative path: "../../app.md"',
        'layers.app.moduleGraphs.feature.docsPath must be a canonical project-relative path: "/feature.md"',
        'layerGraphs.architecture.docsPath must be a canonical project-relative path: "docs/../architecture.md"',
      ]),
    );
  });

  test('finds overlaps within and across Layers', async () => {
    const error = await readScenarioError('overlapping-scopes');

    expect(
      error.issues.filter((issue) => issue.kind === 'overlap'),
    ).toHaveLength(2);
  });

  test('collects unknown Layer references', async () => {
    const error = await readScenarioError('unknown-layer-reference');

    expect(error.issues.map((issue) => issue.message)).toEqual([
      'LayerGraph architecture references unknown Layer ghost',
      'LayerGraph architecture references unknown Layer missing',
    ]);
  });

  test('rejects a cycle formed across LayerGraphs', async () => {
    const error = await readScenarioError('cross-graph-cycle');

    expect(error.issues).toEqual([
      {
        kind: 'cycle',
        message: 'Layer rule cycle includes: app, domain',
      },
    ]);
  });
});

describe('ConfigService.jsonSchema', () => {
  test('describes the config shape', () => {
    const schema = ConfigService.jsonSchema();

    expect(schema.required).toEqual(
      expect.arrayContaining(['sourceRoots', 'layers', 'layerGraphs']),
    );
  });

  test('matches the published schema snapshot', async () => {
    const schema = `${JSON.stringify(ConfigService.jsonSchema(), null, 2)}\n`;

    await expect(schema).toMatchFileSnapshot('../../../../schema.json');
  });
});
